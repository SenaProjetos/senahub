-- F7.4 — Pagamento por fase (D31, D38). Aditiva: duas colunas NULL na fase e uma no pagamento;
-- nenhuma linha existente muda. Pagamento sem fase (`etapaId` nulo) é o modo de sempre — a
-- disciplina inteira — e continua funcionando exatamente como antes.

-- AlterTable
ALTER TABLE "disciplina_etapa" ADD COLUMN     "liberadaEm" TIMESTAMP(3),
ADD COLUMN     "valorPagamento" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "pagamento_projetista" ADD COLUMN     "etapaId" TEXT;

-- CreateIndex
CREATE INDEX "pagamento_projetista_etapaId_idx" ON "pagamento_projetista"("etapaId");

-- AddForeignKey
-- NO ACTION (não RESTRICT): pagamento e fase caem em cascata com a disciplina; RESTRICT seria
-- conferido na hora e poderia barrar a cascata pela ordem. Apagar só a fase com pagamento
-- pendurado continua recusado.
ALTER TABLE "pagamento_projetista" ADD CONSTRAINT "pagamento_projetista_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "disciplina_etapa"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
