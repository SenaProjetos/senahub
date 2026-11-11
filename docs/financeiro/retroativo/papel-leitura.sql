-- Usuário do Postgres SÓ DE LEITURA para o lançamento retroativo (spec 2026-11-10 §6.1).
--
-- Quem usa: o Claude Code no PC do servidor, numa pasta de trabalho própria (fora da pasta do app),
-- com a string de conexão no .env DAQUELA pasta (LEITURA_DATABASE_URL) — nunca no .env do app.
--
-- Rodar como o dono do banco (postgres), no banco do SenaHub (PostgreSQL 15 ou mais novo):
--   psql -h localhost -p <porta> -U postgres -d <banco> -f papel-leitura.sql
-- O script cria o papel SEM senha e pede a senha no fim (\password): ela não fica no histórico do shell, na
-- lista de processos nem no log do servidor. Troque a senha (ou apague o papel) ao terminar o trabalho.
--
-- O que o papel enxerga: só as tabelas abaixo e, das que guardam dado pessoal (cliente, fornecedor, conta
-- bancária, sócio), só as colunas que a categorização usa. Do usuário, só id, nome e e-mail dos SÓCIOS (view
-- leitura_usuario). NÃO enxerga: account (senhas), session, cofre de acessos, RH, folha, holerites, ponto, nem
-- nenhuma outra tabela ou coluna.
--
-- O que impede a escrita é a falta de INSERT/UPDATE/DELETE: o papel não tem nenhum. O
-- default_transaction_read_only é uma segunda barreira (o próprio papel poderia desligá-lo na sessão, mas
-- continuaria sem permissão de escrita). Teste de aceite (os três têm de falhar):
--   INSERT INTO cliente (id, nome) VALUES ('x', 'teste');
--   BEGIN READ WRITE; UPDATE lancamento SET descricao = descricao WHERE false; ROLLBACK;
--   SELECT * FROM account LIMIT 1;
--
-- Desfazer (no fim do trabalho):
--   DROP VIEW IF EXISTS leitura_usuario;
--   DROP OWNED BY senahub_leitura;
--   DROP ROLE senahub_leitura;

\set ON_ERROR_STOP on

CREATE ROLE senahub_leitura LOGIN;
ALTER ROLE senahub_leitura SET default_transaction_read_only = on;

-- Conectar e enxergar o schema (sem criar nada nele; no PG 15+ o PUBLIC já não tem CREATE em public).
SELECT format('GRANT CONNECT ON DATABASE %I TO senahub_leitura', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO senahub_leitura;
REVOKE CREATE ON SCHEMA public FROM senahub_leitura;

-- Do usuário, só os sócios, e só o necessário para reconhecê-los pelo nome/e-mail (a tabela "user" não é liberada).
CREATE OR REPLACE VIEW leitura_usuario AS
  SELECT u.id, u.name, u.email
    FROM "user" u
    JOIN socio s ON s."userId" = u.id;

-- Tabelas inteiras: lançamentos e cadastros sem dado pessoal.
GRANT SELECT ON
  lancamento,
  categoria_financeira,
  forma_pagamento,
  centro_custo,
  projeto,
  leitura_usuario,
  regra_categorizacao,
  compromisso_recorrente,
  fechamento_mensal,
  importacao_financeira
TO senahub_leitura;

-- Tabelas com dado pessoal: só as colunas que a categorização usa.
GRANT SELECT (id, tipo, nome, "nomeFantasia", documento, "excluidoEm") ON cliente TO senahub_leitura;
GRANT SELECT (id, tipo, nome, documento) ON fornecedor TO senahub_leitura;
GRANT SELECT (id, nome, tipo, ativo, "saldoInicial", "saldoInicialEm") ON conta_bancaria TO senahub_leitura;
GRANT SELECT (id, "userId", ativo) ON socio TO senahub_leitura;

\echo 'Defina agora a senha do papel senahub_leitura:'
\password senahub_leitura
