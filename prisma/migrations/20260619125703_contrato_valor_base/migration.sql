-- AlterTable
ALTER TABLE "contrato_licitacao" ADD COLUMN     "valorHomologadoBase" DECIMAL(14,2);

-- Backfill: seed inicial com o valor homologado (base para cálculo de % de acréscimo)
UPDATE "contrato_licitacao" SET "valorHomologadoBase" = "valorHomologado" WHERE "valorHomologadoBase" IS NULL;
