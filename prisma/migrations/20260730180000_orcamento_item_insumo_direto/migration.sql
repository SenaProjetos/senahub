-- AlterTable
ALTER TABLE "custo_orcamento_item" ADD COLUMN     "insumoId" TEXT;

-- CreateIndex
CREATE INDEX "custo_orcamento_item_insumoId_idx" ON "custo_orcamento_item"("insumoId");

-- AddForeignKey
ALTER TABLE "custo_orcamento_item" ADD CONSTRAINT "custo_orcamento_item_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "custo_insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

