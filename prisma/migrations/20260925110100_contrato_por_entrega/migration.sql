-- F7.3 (D15) — contrato de cliente cobrado POR ENTREGA: parcelas ligadas a marcos da EAP.
-- Aditiva: todo contrato existente fica `por_data` (o default), exatamente como era.

-- CreateEnum
CREATE TYPE "FormaCobranca" AS ENUM ('por_data', 'por_entrega');

-- AlterTable
ALTER TABLE "documento_juridico" ADD COLUMN     "formaCobranca" "FormaCobranca" NOT NULL DEFAULT 'por_data';

-- CreateTable
CREATE TABLE "contrato_parcela_entrega" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "marcoId" TEXT,
    "lancamentoId" TEXT,

    CONSTRAINT "contrato_parcela_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contrato_parcela_entrega_lancamentoId_key" ON "contrato_parcela_entrega"("lancamentoId");

-- CreateIndex
CREATE INDEX "contrato_parcela_entrega_contratoId_idx" ON "contrato_parcela_entrega"("contratoId");

-- CreateIndex
CREATE INDEX "contrato_parcela_entrega_marcoId_idx" ON "contrato_parcela_entrega"("marcoId");

-- AddForeignKey
ALTER TABLE "contrato_parcela_entrega" ADD CONSTRAINT "contrato_parcela_entrega_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "documento_juridico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_parcela_entrega" ADD CONSTRAINT "contrato_parcela_entrega_marcoId_fkey" FOREIGN KEY ("marcoId") REFERENCES "eap_tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_parcela_entrega" ADD CONSTRAINT "contrato_parcela_entrega_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
