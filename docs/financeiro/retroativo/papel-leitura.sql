-- Usuário do Postgres SÓ DE LEITURA para o lançamento retroativo (spec 2026-11-10 §6.1).
--
-- Quem usa: o Claude Code no PC do servidor, numa pasta de trabalho própria (fora da pasta do app),
-- com a string de conexão no .env DAQUELA pasta (LEITURA_DATABASE_URL) — nunca no .env do app.
--
-- Rodar como o dono do banco (postgres), no banco do SenaHub, passando a senha por variável:
--   psql -h localhost -p <porta> -U postgres -d <banco> -v senha='<senha forte e nova>' -f papel-leitura.sql
--
-- O que o papel enxerga: só as tabelas abaixo (lançamentos e cadastros que a categorização usa) e,
-- do usuário, só id, nome e e-mail (pela view leitura_usuario). NÃO enxerga: account (senhas),
-- session, cofre de acessos, RH, folha, holerites, ponto, nem nenhuma outra tabela.
-- Toda transação dele é só leitura (default_transaction_read_only): um INSERT/UPDATE/DELETE falha.
--
-- Desfazer (no fim do trabalho):
--   DROP VIEW IF EXISTS leitura_usuario;
--   DROP OWNED BY senahub_leitura;
--   DROP ROLE senahub_leitura;

\set ON_ERROR_STOP on

CREATE ROLE senahub_leitura LOGIN PASSWORD :'senha';
ALTER ROLE senahub_leitura SET default_transaction_read_only = on;

-- Conectar e enxergar o schema (sem criar nada nele).
SELECT format('GRANT CONNECT ON DATABASE %I TO senahub_leitura', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO senahub_leitura;
REVOKE CREATE ON SCHEMA public FROM senahub_leitura;

-- Do usuário, só o necessário para reconhecer o sócio pelo nome/e-mail (a tabela "user" não é liberada).
CREATE OR REPLACE VIEW leitura_usuario AS
  SELECT id, name, email FROM "user";

GRANT SELECT ON
  lancamento,
  categoria_financeira,
  conta_bancaria,
  forma_pagamento,
  centro_custo,
  fornecedor,
  cliente,
  projeto,
  socio,
  leitura_usuario,
  regra_categorizacao,
  compromisso_recorrente,
  fechamento_mensal,
  importacao_financeira
TO senahub_leitura;
