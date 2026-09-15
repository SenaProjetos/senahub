-- Concede `escopo:global` (ver todos os projetos da empresa) ao perfil de acesso `coordenador`.
--
-- REVOGA A DECISÃO §9.7 de 2026-07-28 ("Coordenador NÃO mantém o escopo global — a empresa está
-- migrando para gestores por setor"). Revogada pelo dono em 2026-09-04: "Coordenador é geral, vê
-- todos os projetos. Temos planos para subdividir por disciplina mais à frente." A subdivisão futura
-- vai RESTRINGIR um escopo global existente, em vez de ampliar um restrito — a direção mais segura.
--
-- EXCEÇÃO CONSCIENTE À REGRA DE DERIVAR (ver `20260902120000_perfis_tarefas_ver`): par novo deve
-- ser concedido a quem já tem um par equivalente, para preservar customização do dono. Aqui não há
-- equivalente — por causa de §9.7, NENHUM perfil tem `escopo:global` hoje; o sócio o recebe por
-- override individual (`permissao_usuario`), que esta migration não toca. Por isso o perfil é
-- nomeado pela chave. Não "corrigir" para uma derivação: não existe de onde derivar.
--
-- ALCANCE: `escopo:global` é LEITURA. Alimenta `acessoGlobal()` → `escopoProjeto()` e os gates de
-- listagem/download que dependem dele. NÃO concede escrita em disciplina alheia: os overrides de
-- escrita ainda leem o papel (`GLOBAL_ROLES`) e são decisão separada.
--
-- EFEITO NO GATE DE EQUIVALÊNCIA (`checar-equivalencia-permissoes.ts`, que compara com a regra
-- legada `GLOBAL_ROLES || sócio`): quem tem papel `supervisor` deixa de acusar a PERDA aberta pela
-- Onda D; quem tem outro papel com este perfil (ex.: CLT que coordena) aparece como GANHO — que é
-- justamente a mudança pedida.
--
-- Idempotente por `ON CONFLICT` na unique (perfilId, recurso, acao). `DO NOTHING` também preserva
-- uma revogação deliberada (`permitido = false`) que o dono tenha feito na tela de Perfis.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'escopo', 'global', true
FROM "perfil_acesso" p
WHERE p."chave" = 'coordenador'
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
