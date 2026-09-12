-- Concede `financeiro:folha_pj_corrigir` a quem já tem `financeiro:folha_pj`.
--
-- POR QUE UMA MIGRATION: `seedPerfisAcesso` é create-only desde 2026-09-02 (§5-A de
-- docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md). Par novo no catálogo NÃO
-- chega sozinho a perfil que já existe — sem este arquivo, o par nasce negado para todo mundo,
-- em silêncio, e a Produção perderia corrigir/estornar/excluir da noite para o dia.
--
-- POR QUE ESTE PAR (D37/G2): `folha_pj` acumulava dois poderes diferentes — pagar e DESFAZER o
-- que já foi pago (corrigir um pagamento efetivado, estornar, excluir lote). São ações de
-- naturezas distintas, e a separação é o mesmo raciocínio do recorte da F4.
--
-- NEUTRALIDADE: deriva de `permissao_perfil`, não de uma lista de chaves — quem pode pagar hoje
-- passa a ter também o par novo, então NINGUÉM perde acesso nesta migration. O que muda é que o
-- dono passa a poder revogar só o `folha_pj_corrigir` de um perfil, pela tela de Perfis.
-- Derivar da tabela (em vez de listar perfis) preserva a customização já feita: perfil que teve
-- `folha_pj` revogado à mão não ganha o par novo.
--
-- Idempotente por `ON CONFLICT` na unique (perfilId, recurso, acao): reexecutar não duplica nem
-- sobrescreve uma revogação deliberada feita depois.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, pp."perfilId", 'financeiro', 'folha_pj_corrigir', true
FROM "permissao_perfil" pp
WHERE pp."recurso" = 'financeiro' AND pp."acao" = 'folha_pj' AND pp."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Override individual: quem tem o par ANTIGO liberado nominalmente (com validade, inclusive)
-- também precisa do novo, senão perde corrigir/estornar sem ninguém ter decidido isso.
-- `expiraEm` e `motivo` acompanham — o override novo morre junto com o que o originou.
INSERT INTO "permissao_usuario" ("id", "userId", "recurso", "acao", "permitido", "expiraEm", "motivo")
SELECT gen_random_uuid()::text, pu."userId", 'financeiro', 'folha_pj_corrigir', true, pu."expiraEm", pu."motivo"
FROM "permissao_usuario" pu
WHERE pu."recurso" = 'financeiro' AND pu."acao" = 'folha_pj' AND pu."permitido" = true
ON CONFLICT ("userId", "recurso", "acao") DO NOTHING;
