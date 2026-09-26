-- Pares novos do recurso `cronograma` (F2.6 da spec do motor de planejamento).
--
-- POR QUE MIGRATION E NÃO SEED: o `db:seed` de permissão é create-only — ele só cria o par
-- que não existe em lugar nenhum. Par declarado só no catálogo nasce sem NINGUÉM tendo, e a
-- tela de Perfis mostra tudo desmarcado até alguém marcar na mão, perfil por perfil.
--
-- REGRA DE DERIVAÇÃO (ver `20260915140000_perfil_coordenador_escopo_global`): conceder a
-- quem já tem um par EQUIVALENTE, nunca nomeando o perfil pela chave. É o que preserva a
-- customização que o dono já fez na tela — um perfil de quem ele tirou `recursos:gerir`
-- também não recebe `cronograma:gerir`, que é justamente o desejado.
--
--   cronograma:ver       ← recursos:ver     (quem vê a matriz de recursos vê o cronograma)
--   cronograma:gerir     ← recursos:gerir   (mesma população que hoje gere alocação)
--   cronograma:executado ← recursos:gerir   (informar avanço acompanha quem gere)
--   cronograma:aprovar   ← recursos:gerir   (parte daqui; o dono restringe na tela — é mais
--                                            seguro conceder e tirar do que ninguém ter e o
--                                            botão parecer quebrado no primeiro uso)
--
-- Idempotente por `ON CONFLICT` na unique (perfilId, recurso, acao). `DO NOTHING` também
-- preserva uma revogação deliberada (`permitido = false`) feita na tela de Perfis.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."perfilId", 'cronograma', 'ver', true
  FROM "permissao_perfil" p
 WHERE p."recurso" = 'recursos' AND p."acao" = 'ver' AND p."permitido" = true
    ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."perfilId", 'cronograma', v."acao", true
  FROM "permissao_perfil" p
 CROSS JOIN (VALUES ('gerir'), ('aprovar'), ('executado')) AS v("acao")
 WHERE p."recurso" = 'recursos' AND p."acao" = 'gerir' AND p."permitido" = true
    ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Quem pode gerir também precisa ver: sem isto, um perfil com `recursos:gerir` mas sem
-- `recursos:ver` (combinação possível na tela) ganharia o botão e não a tela.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."perfilId", 'cronograma', 'ver', true
  FROM "permissao_perfil" p
 WHERE p."recurso" = 'recursos' AND p."acao" = 'gerir' AND p."permitido" = true
    ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
