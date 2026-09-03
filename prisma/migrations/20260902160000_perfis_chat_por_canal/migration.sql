-- Quebra do chat por TipoCanal (F3 de
-- docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md): `chat:geral`, `chat:dm` e
-- `chat:grupo` concedidos a quem já tem `chat:usar`.
--
-- POR QUE UMA MIGRATION: desde 2026-09-02 `seedPerfisAcesso` é create-only e não distribui par
-- novo a perfil existente. Ver `20260902120000_perfis_tarefas_ver`, o primeiro deste padrão.
--
-- POR QUE "quem já tem `chat:usar`" E NÃO uma lista de chaves fixa: se o dono já tiver
-- customizado quem entra no chat (concedido a `freelancer`, revogado de alguém), a lista fixa
-- desfaria a customização. Derivar do par existente preserva a decisão dele e reproduz
-- exatamente o comportamento de hoje — `#geral`, DM e criação de grupo eram todos governados
-- pelo mesmo `CHAT_ROLES` que originou `chat:usar`.
--
-- Vale para perfil semente E customizado, que é o ponto: o create-only tornou os dois iguais.
--
-- Idempotente por `ON CONFLICT`: reexecutar não duplica nem sobrescreve revogação deliberada.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, base."perfilId", 'chat', novo.acao, true
FROM "permissao_perfil" base
CROSS JOIN (VALUES ('geral'), ('dm'), ('grupo')) AS novo(acao)
WHERE base."recurso" = 'chat' AND base."acao" = 'usar' AND base."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Overrides individuais de `chat:usar` seguem a mesma lógica: quem ganhou (ou perdeu) o chat
-- nominalmente tinha, com isso, os três comportamentos juntos. Espelhar mantém o efeito.
-- `expiraEm` e `motivo` são copiados para a exceção continuar contando a mesma história.
INSERT INTO "permissao_usuario" ("id", "userId", "recurso", "acao", "permitido", "motivo", "expiraEm", "concedidoPorId", "criadoEm")
SELECT gen_random_uuid()::text, base."userId", 'chat', novo.acao, base."permitido",
       base."motivo", base."expiraEm", base."concedidoPorId", NOW()
FROM "permissao_usuario" base
CROSS JOIN (VALUES ('geral'), ('dm'), ('grupo')) AS novo(acao)
WHERE base."recurso" = 'chat' AND base."acao" = 'usar'
ON CONFLICT ("userId", "recurso", "acao") DO NOTHING;
