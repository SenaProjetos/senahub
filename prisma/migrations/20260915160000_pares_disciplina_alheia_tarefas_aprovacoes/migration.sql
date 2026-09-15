-- Três pares novos que substituem gates presos ao papel (`GLOBAL_ROLES` = admin + supervisor).
-- Decisão do dono em 2026-09-15 (grill Q18/Q21): a coordenadora contratada CLT com perfil
-- Coordenador precisa agir como coordenadora, e o papel não pode mais ser o que decide isso.
--
-- POR QUE UMA MIGRATION: `seedPerfisAcesso` é create-only desde 2026-09-02 e não distribui par
-- novo a perfil existente. Modelo: `20260902120000_perfis_tarefas_ver`.
--
-- Idempotente por `ON CONFLICT ... DO NOTHING`: reexecutar não duplica nem desfaz revogação
-- deliberada feita na tela de perfis.

-- 1. `aprovacoes:disciplina` — finalizar a entrega (validarEntrega + passo 2 do fluxo em 2
--    etapas). DERIVADO de `uploads:validar`, que até hoje governava `validarEntrega`: quem
--    liberava a entrega continua liberando, em perfil semente ou customizado.
--    Efeito colateral deliberado: o passo 2 (confirmar/recusar) exigia o papel admin/supervisor
--    e passa a seguir este par — quem tem `uploads:validar` num perfil customizado sem ser
--    supervisor ganha o passo 2. É a unificação pedida (Q18: "os dois caminhos de finalizar").
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, base."perfilId", 'aprovacoes', 'disciplina', base."permitido"
FROM "permissao_perfil" base
WHERE base."recurso" = 'uploads' AND base."acao" = 'validar'
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Overrides nominais de `uploads:validar` (concedidos OU negados) valiam para `validarEntrega`
-- também; espelhar mantém o efeito, com o mesmo motivo e a mesma expiração.
INSERT INTO "permissao_usuario" ("id", "userId", "recurso", "acao", "permitido", "motivo", "expiraEm", "concedidoPorId", "criadoEm")
SELECT gen_random_uuid()::text, base."userId", 'aprovacoes', 'disciplina', base."permitido",
       base."motivo", base."expiraEm", base."concedidoPorId", NOW()
FROM "permissao_usuario" base
WHERE base."recurso" = 'uploads' AND base."acao" = 'validar'
ON CONFLICT ("userId", "recurso", "acao") DO NOTHING;

-- 2. `projetos:atuar_disciplina_alheia` e `tarefas:gerir_todas` — NOMEADOS ao perfil
--    `coordenador`, sem derivação. Exceção consciente ao padrão "derivar do par equivalente":
--    não existe par equivalente. O gate antigo era o PAPEL (admin + supervisor); o admin é
--    `superUsuario` (bypass, sem perfil) e o único perfil que espelha o supervisor é o
--    `coordenador`. Derivar de `projetos:gerir` daria escrita na disciplina alheia ao perfil
--    `administrativo`, que nunca a teve — ampliação silenciosa que ninguém pediu.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", novo.recurso, novo.acao, true
FROM "perfil_acesso" p
CROSS JOIN (VALUES ('projetos', 'atuar_disciplina_alheia'), ('tarefas', 'gerir_todas')) AS novo(recurso, acao)
WHERE p."chave" = 'coordenador'
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
