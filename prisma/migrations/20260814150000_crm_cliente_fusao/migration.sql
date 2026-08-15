-- CRM Fase 1c (F1.14): fusão de clientes duplicados.
--
-- Aditiva, tudo nullable. `fundidoEmId` é auto-referência: o cliente absorvido aponta para o
-- sobrevivente. Nada é apagado na fusão — o absorvido continua existindo, arquivado
-- (`ativo = false`), com esta referência. É o que permite auditar depois "para onde foi este
-- cadastro" e, se preciso, reverter à mão.
--
-- ON DELETE SET NULL: se um dia o sobrevivente for removido, o absorvido não some junto —
-- só perde o ponteiro. Preferível a CASCADE, que apagaria histórico em cadeia.

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "fundidoEmId" TEXT,
ADD COLUMN     "fusaoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "cliente_fundidoEmId_idx" ON "cliente"("fundidoEmId");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_fundidoEmId_fkey" FOREIGN KEY ("fundidoEmId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
