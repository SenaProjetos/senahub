-- Dois prazos por projeto: contrato (compromisso com o cliente) e planejado (interno).
-- Aditiva e idempotente: a coluna "prazoFinal" NÃO é renomeada nem removida — o campo
-- Prisma `prazoContrato` a mapeia (@map), então o código antigo segue funcionando na
-- janela entre esta migração e o deploy.

ALTER TABLE "projeto" ADD COLUMN IF NOT EXISTS "prazoPlanejado" TIMESTAMP(3);

-- Backfill: projetos existentes passam a ter o prazo atual como prazo de contrato
-- (já é a mesma coluna) e uma cópia como prazo planejado. Divergências reais ficam
-- para os administradores ajustarem à mão.
UPDATE "projeto" SET "prazoPlanejado" = "prazoFinal" WHERE "prazoPlanejado" IS NULL;
