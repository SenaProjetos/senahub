-- F5.10 (CRM Fase 5) — perda estruturada também para Proposta, e observação livre em ambas.
--
-- `Negociacao` já tinha `motivoPerdaId`/`concorrente` desde uma fase anterior; ganha aqui só
-- `observacaoPerda`. `Proposta` ganha o trio inteiro, reusando o MESMO catálogo `MotivoPerda`
-- (nunca um segundo catálogo para a mesma classificação — erro já documentado do
-- `DisciplinaCatalogo`). Todas as colunas nullable: nenhuma proposta/negociação histórica tem
-- motivo, e não há como inventar um.

-- AlterTable: Negociacao
ALTER TABLE "negociacao" ADD COLUMN "observacaoPerda" TEXT;

-- AlterTable: Proposta
ALTER TABLE "proposta" ADD COLUMN "motivoPerdaId" TEXT;
ALTER TABLE "proposta" ADD COLUMN "concorrente" TEXT;
ALTER TABLE "proposta" ADD COLUMN "observacaoRecusa" TEXT;

-- CreateIndex
CREATE INDEX "proposta_motivoPerdaId_idx" ON "proposta"("motivoPerdaId");

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "motivo_perda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
