-- Concede `rh:produtividade` a quem já abria RH → Produtividade.
--
-- POR QUE UMA MIGRATION: `seedPerfisAcesso` é create-only desde 2026-09-02 e não distribui par
-- novo a perfil existente. Modelo: `20260902120000_perfis_tarefas_ver`.
--
-- POR QUE ESTES PERFIS (nomeados, sem derivar): o gate antigo era o PAPEL — `requireRole(HR_ADMIN_ROLES)`
-- = admin + supervisor + administrativo. Admin é `superUsuario` (bypass, sem perfil); os perfis que
-- espelham os outros dois são `coordenador` e `administrativo`. Derivar de `rh:cadastro` deixaria o
-- coordenador de fora (ele nunca teve `rh:cadastro`) — perda silenciosa de uma tela que ele usa.
--
-- Idempotente por `ON CONFLICT ... DO NOTHING`: reexecutar não duplica nem desfaz revogação feita na tela.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'rh', 'produtividade', true
FROM "perfil_acesso" p
WHERE p."chave" IN ('coordenador', 'administrativo')
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Tabela legada `permissao`: o piso de sócio de `requirePermission` consulta
-- `canRole("supervisor", …)` nela. Sem esta linha, o sócio perderia a tela até o próximo `db:seed`.
INSERT INTO "permissao" ("id", "role", "recurso", "acao", "permitido")
VALUES
  (gen_random_uuid()::text, 'supervisor', 'rh', 'produtividade', true),
  (gen_random_uuid()::text, 'administrativo', 'rh', 'produtividade', true)
ON CONFLICT ("role", "recurso", "acao") DO NOTHING;
