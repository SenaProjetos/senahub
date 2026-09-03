-- Concede `tarefas:ver` aos perfis semente que espelham os 7 papéis internos.
--
-- POR QUE UMA MIGRATION E NÃO O SEED: a partir de 2026-09-02 `seedPerfisAcesso` é create-only
-- (decisão do dono, §5-A de docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md).
-- O `db:seed` deixou de regravar a matriz dos perfis existentes — o que protege a configuração
-- do dono contra o deploy, mas também significa que par NOVO no catálogo não chega sozinho a
-- perfil que já existe. Este arquivo é o MODELO para todo par futuro: adicionar ao catálogo e à
-- `PERMISSOES_BASE` cobre banco novo; conceder a quem já está no ar é esta migration.
--
-- POR QUE ESTE PAR: `tarefas:ver` era consultado em `modules/busca/actions.ts` sem existir no
-- catálogo. Par ausente resolve `false`, então tarefa nunca aparecia na busca global (Ctrl+K)
-- para ninguém além de `superUsuario` — apesar de essas mesmas pessoas poderem abrir `/tarefas`
-- e ver as mesmas tarefas. É restauração de PARIDADE, não concessão nova: `/tarefas` é
-- `requireRole(...INTERNAL_ROLES)` e a busca já recorta por `escopoTarefa(user)`.
--
-- `portal_cliente` fica de fora: cliente não é interno e não alcança `/tarefas`.
-- `admin` não tem perfil (é `superUsuario`, bypass).
--
-- Idempotente por `ON CONFLICT` na unique (perfilId, recurso, acao) — reexecutar não duplica
-- e não sobrescreve uma revogação deliberada que o dono tenha feito na tela.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'tarefas', 'ver', true
FROM "perfil_acesso" p
WHERE p."chave" IN ('coordenador', 'administrativo', 'clt', 'estagiario', 'projetista_pj', 'freelancer', 'ti')
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
