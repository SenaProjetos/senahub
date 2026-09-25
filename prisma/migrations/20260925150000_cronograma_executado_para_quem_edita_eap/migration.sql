-- L4 do plano de correção do motor de planejamento (2026-09-25): quem edita a EAP também pode
-- informar o andamento dela.
--
-- O botão "Atualizar tarefa" (datas reais), a Data de Status e o verificador sob demanda são de
-- `cronograma:executado` / `cronograma:ver`, mas a F2.6 derivou esses pares de `recursos:*`,
-- enquanto o editor da linha da EAP é de `planejamento:gerir`. Perfil com `planejamento:gerir` e sem
-- `recursos:gerir` (combinação possível na tela de Perfis) montava o cronograma e não conseguia
-- registrar uma data real nem apurar.
--
--   cronograma:executado ← planejamento:gerir   (montar o cronograma acompanha informar o avanço)
--   cronograma:ver       ← planejamento:gerir   (o verificador roda pelo mesmo painel — mesmo motivo
--                                                do último INSERT da 20260924120000)
--
-- `cronograma:aprovar` NÃO é concedido: aprovar congela a linha de base, que vira o combinado com o
-- cliente — o dono decide na tela de Perfis, como na F2.6.
--
-- Mesma regra de derivação da 20260924120000_permissoes_cronograma: conceder a quem já tem o par
-- EQUIVALENTE, nunca nomeando o perfil pela chave. Idempotente e sem sobrescrever: `DO NOTHING` na
-- unique (perfilId, recurso, acao) preserva uma revogação deliberada (`permitido = false`) feita na
-- tela. Nos perfis padrão (Coordenador e Administrativo, que já têm os dois lados) não muda nada.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."perfilId", 'cronograma', v."acao", true
  FROM "permissao_perfil" p
 CROSS JOIN (VALUES ('ver'), ('executado')) AS v("acao")
 WHERE p."recurso" = 'planejamento' AND p."acao" = 'gerir' AND p."permitido" = true
    ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
