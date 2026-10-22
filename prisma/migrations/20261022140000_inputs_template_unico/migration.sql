-- Perguntas que já vieram do padrão (antes do templateId) ganham a origem, casando texto e
-- disciplina: editar o texto depois não faz o padrão recriá-las. Uma linha por projeto e padrão
-- (a mais antiga), para caber no índice único abaixo.
UPDATE "input_projeto" ip
SET "templateId" = x."templateId"
FROM (
  SELECT DISTINCT ON (ip2."projetoId", t."id") ip2."id" AS "inputId", t."id" AS "templateId"
  FROM "input_projeto" ip2
  JOIN "input_template" t
    ON t."pergunta" = ip2."pergunta"
   AND COALESCE(t."disciplina", '') = COALESCE(ip2."disciplina", '')
  WHERE ip2."templateId" IS NULL
  ORDER BY ip2."projetoId", t."id", ip2."createdAt", ip2."id"
) x
WHERE ip."id" = x."inputId"
  AND NOT EXISTS (
    SELECT 1 FROM "input_projeto" o
    WHERE o."projetoId" = ip."projetoId" AND o."templateId" = x."templateId"
  );

-- Uma pergunta por padrão em cada projeto: dois "Aplicar padrão" simultâneos não duplicam.
CREATE UNIQUE INDEX "input_projeto_projetoId_templateId_key" ON "input_projeto"("projetoId", "templateId");
