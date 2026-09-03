-- F4 de docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md: recorte fino do
-- financeiro, das configurações e das abas de projeto.
--
-- Terceira migration do padrão create-only (ver `20260902120000_perfis_tarefas_ver`). Todas as
-- concessões DERIVAM de um par que o perfil já tem, nunca de uma lista fixa de chaves: assim a
-- customização que o dono já tenha feito é preservada, e o resultado é o acesso de hoje,
-- exatamente. Vale para perfil semente e customizado.
--
-- O QUE NÃO É CONCEDIDO AQUI, de propósito:
--   `configuracoes:licitacoes` e `projetos:pastas` eram `requireRole("admin")`/`roles:["admin"]`
--   — ninguém além do bypass de `superUsuario` os alcançava. Conceder a alguém agora seria
--   ampliar acesso, não reproduzi-lo. Ficam grantáveis pela tela, concedidos por decisão.

-- ── Financeiro ───────────────────────────────────────────────────────────────────────────────
-- Quem lançava (`gerir`) mantém conciliação, fechamento e folha de projetistas.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, base."perfilId", 'financeiro', novo.acao, true
FROM "permissao_perfil" base
CROSS JOIN (VALUES ('conciliar'), ('fechar'), ('folha_pj')) AS novo(acao)
WHERE base."recurso" = 'financeiro' AND base."acao" = 'gerir' AND base."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Quem já via o financeiro mantém rentabilidade/balanço/DFC/relatórios.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, base."perfilId", 'financeiro', 'resultados', true
FROM "permissao_perfil" base
WHERE base."recurso" = 'financeiro' AND base."acao" = 'ver' AND base."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- ── Configurações ────────────────────────────────────────────────────────────────────────────
-- `/configuracoes/disciplinas` era `requireRole("admin","supervisor")`. O perfil espelho do
-- `supervisor` é `coordenador` — única chave nomeada nesta migration, porque a regra antiga era
-- por PAPEL e não havia par equivalente de onde derivar.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'configuracoes', 'disciplinas', true
FROM "perfil_acesso" p
WHERE p."chave" = 'coordenador'
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- ── Abas do projeto ──────────────────────────────────────────────────────────────────────────
-- Serviços, ARTs e Extras não tinham gate NENHUM: apareciam para quem abrisse o projeto. A
-- reprodução fiel é "quem tem `projetos:ver`".
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, base."perfilId", 'projetos', novo.acao, true
FROM "permissao_perfil" base
CROSS JOIN (VALUES ('servicos'), ('arts'), ('extras')) AS novo(acao)
WHERE base."recurso" = 'projetos' AND base."acao" = 'ver' AND base."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- O Diário era `INTERNAL_ROLES` — todos menos cliente. `portal_cliente` é o perfil espelho do
-- papel `cliente`, o único externo; por isso a exclusão é por chave e não derivada.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, base."perfilId", 'projetos', 'diario', true
FROM "permissao_perfil" base
JOIN "perfil_acesso" p ON p."id" = base."perfilId"
WHERE base."recurso" = 'projetos' AND base."acao" = 'ver' AND base."permitido" = true
  AND p."chave" <> 'portal_cliente'
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
