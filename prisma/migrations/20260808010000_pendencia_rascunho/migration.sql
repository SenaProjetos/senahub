-- Item 31: modo rascunho. `publicadoEm` nulo = rascunho (só o autor vê).
--
-- ATENÇÃO: é a PRIMEIRA migração não-aditiva desta leva. A coluna nasce nullable, mas toda
-- linha existente PRECISA de backfill: sem ele, todo apontamento já criado viraria rascunho
-- invisível de uma vez — sumindo de badge, visão gerencial, gate de validação e export.
ALTER TABLE "pendencia" ADD COLUMN "publicadoEm" TIMESTAMP(3);

-- Publicado desde que foi criado: é o comportamento que essas linhas sempre tiveram.
UPDATE "pendencia" SET "publicadoEm" = "createdAt" WHERE "publicadoEm" IS NULL;

-- Consultas de trabalho filtram por (status, publicadoEm) juntos.
CREATE INDEX "pendencia_publicadoEm_idx" ON "pendencia"("publicadoEm");
