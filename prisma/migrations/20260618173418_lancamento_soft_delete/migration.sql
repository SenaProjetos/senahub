-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "excluidoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "lancamento_excluidoEm_idx" ON "lancamento"("excluidoEm");
