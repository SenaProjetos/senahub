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

-- Quem tem papel supervisor/administrativo mas está num perfil PERSONALIZADO (chave fora das duas
-- acima) também abria a tela pelo papel. Conceder ao perfil inteiro ampliaria o acesso de quem mais o
-- usa; o override individual devolve exatamente o que cada pessoa tinha. O dono revoga na ficha se quiser.
INSERT INTO "permissao_usuario" ("id", "userId", "recurso", "acao", "permitido", "motivo", "criadoEm")
SELECT gen_random_uuid()::text, u."id", 'rh', 'produtividade', true,
       'Migração 2026-10-07: mantém o acesso a Produtividade que vinha do papel', NOW()
FROM "user" u
WHERE u."role" IN ('supervisor', 'administrativo')
  AND u."perfilId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "permissao_perfil" pp
    WHERE pp."perfilId" = u."perfilId" AND pp."recurso" = 'rh' AND pp."acao" = 'produtividade'
  )
ON CONFLICT ("userId", "recurso", "acao") DO NOTHING;

-- Tabela legada `permissao`: o piso de sócio de `requirePermission` consulta
-- `canRole("supervisor", …)` nela. Sem esta linha, o sócio perderia a tela até o próximo `db:seed`.
INSERT INTO "permissao" ("id", "role", "recurso", "acao", "permitido")
VALUES
  (gen_random_uuid()::text, 'supervisor', 'rh', 'produtividade', true),
  (gen_random_uuid()::text, 'administrativo', 'rh', 'produtividade', true)
ON CONFLICT ("role", "recurso", "acao") DO NOTHING;
