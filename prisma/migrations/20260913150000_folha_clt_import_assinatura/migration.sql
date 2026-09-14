-- Schema do plano docs/superpowers/plans/2026-09-13-folha-clt-import-assinatura.md (P0):
-- 3 campos aditivos p/ import automático da folha CLT via PDF do contador (matrícula/rubrica
-- externas, mapeadas manualmente uma vez) e assinatura do holerite (espelha ReciboProjetista).
-- Todos nullable — sem backfill necessário. Gerada via `prisma migrate diff --from-schema/
-- --to-schema` (schema-to-schema, sem shadow DB) por drift alheio no banco de dev (outra sessão
-- em feat/certidoes-conformidade aplicou schema direto no banco compartilhado, ainda não
-- commitado) — ver skill /nova-migracao.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "matriculaFolhaExterna" TEXT;

-- AlterTable
ALTER TABLE "rubrica_folha" ADD COLUMN     "codigoExterno" TEXT;

-- AlterTable
ALTER TABLE "folha_pagamento" ADD COLUMN     "origemPdfNome" TEXT,
ADD COLUMN     "origemPdfPath" TEXT;

-- AlterTable
ALTER TABLE "holerite" ADD COLUMN     "assinadoEm" TIMESTAMP(3),
ADD COLUMN     "assinanteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_matriculaFolhaExterna_key" ON "user"("matriculaFolhaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "rubrica_folha_codigoExterno_key" ON "rubrica_folha"("codigoExterno");

-- CreateIndex
CREATE INDEX "holerite_userId_assinadoEm_idx" ON "holerite"("userId", "assinadoEm");

-- CreateIndex
CREATE INDEX "holerite_assinanteId_idx" ON "holerite"("assinanteId");

-- AddForeignKey
ALTER TABLE "holerite" ADD CONSTRAINT "holerite_assinanteId_fkey" FOREIGN KEY ("assinanteId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

