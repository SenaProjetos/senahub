-- Reunião de 08/10/2026: cada disciplina do catálogo é UMA habilidade (categoria "disciplina"), para o /recursos
-- dizer quem trabalha com o quê. Só cria o que falta (nome igual, sem diferença de caixa, já é habilidade) e
-- nunca mexe nas habilidades existentes — separar uma habilidade combinada ("Hidrossanitária e PPCI") é com o RH.
INSERT INTO "habilidade" ("id", "nome", "categoria", "publicada")
SELECT gen_random_uuid()::text, dc."nome", 'disciplina', true
FROM "disciplina_catalogo" dc
WHERE dc."ativo" = true
  AND NOT EXISTS (SELECT 1 FROM "habilidade" h WHERE lower(h."nome") = lower(dc."nome"));
