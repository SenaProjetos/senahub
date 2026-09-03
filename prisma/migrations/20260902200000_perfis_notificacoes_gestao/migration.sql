-- F5 de docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md: as audiências de
-- escalonamento (`global`, `rh_admin`, `gestao_operacional`) passam a resolver por permissão.
--
-- POR QUE PARES NOVOS E NÃO OS QUE JÁ EXISTIAM: mapear `rh_admin` para `rh:cadastro` tiraria o
-- Coordenador das notificações de RH (o par só está no administrativo), e `global` para
-- `escopo:global` esvaziaria a audiência inteira (esse par não está em ninguém). Nos dois casos
-- a falha seria SILENCIOSA — notificação que simplesmente para de chegar. É o risco R2 descrito
-- em `lib/audiencias.ts`, e é justamente o que esta onda existe para não causar.
--
-- POR QUE CHAVES NOMEADAS E NÃO DERIVAÇÃO DE OUTRO PAR: estes são eixos NOVOS; não existe par
-- equivalente de onde derivar. Os conjuntos vêm de `GLOBAL_ROLES` e `HR_ADMIN_ROLES`, que eram
-- código, então a tradução é perfil-semente a perfil-semente.
--
-- LIMITAÇÃO CONHECIDA: perfil CUSTOMIZADO não recebe nada aqui — não há como adivinhar se um
-- perfil criado à mão deveria receber escalonamento de RH. Quem tiver criado perfil próprio
-- precisa marcar os pares na tela. Está no relatório da onda, não é silencioso.
--
-- `admin` não aparece: não tem perfil, passa por `superUsuario`.

-- Gestão global (`GLOBAL_ROLES` = admin + supervisor).
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'notificacoes', 'gestao', true
FROM "perfil_acesso" p
WHERE p."chave" = 'coordenador'
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- RH e operação (`HR_ADMIN_ROLES` = admin + supervisor + administrativo).
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'notificacoes', novo.acao, true
FROM "perfil_acesso" p
CROSS JOIN (VALUES ('rh'), ('operacional')) AS novo(acao)
WHERE p."chave" IN ('coordenador', 'administrativo')
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
