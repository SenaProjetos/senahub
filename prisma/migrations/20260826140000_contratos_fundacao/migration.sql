-- Gerenciador de contratos (spec `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`),
-- Fase A — fundação do contrato de equipe, e a coluna de ponte do contrato de cliente.
--
-- Tudo nullable, 100% aditivo: nenhum `DocumentoJuridico` existente muda de comportamento.
-- `vinculoId`/`propostaId` são as duas âncoras (equipe × cliente); `valor`/`statusContrato`
-- nascem aqui porque a Fase H4 (alçada) e a Fase G (cronograma de faturamento) já vão
-- precisar deles, evitando uma 2ª migration só pra isso.

-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('rascunho', 'aguardando_assinatura', 'assinado', 'vencido', 'rescindido');

-- AlterTable
ALTER TABLE "documento_juridico" ADD COLUMN     "vinculoId" TEXT,
ADD COLUMN     "propostaId" TEXT,
ADD COLUMN     "dataVencimento" DATE,
ADD COLUMN     "valor" DECIMAL(14,2),
ADD COLUMN     "statusContrato" "StatusContrato";

-- CreateIndex
CREATE INDEX "documento_juridico_vinculoId_idx" ON "documento_juridico"("vinculoId");

-- CreateIndex
CREATE INDEX "documento_juridico_propostaId_idx" ON "documento_juridico"("propostaId");

-- CreateIndex
CREATE INDEX "documento_juridico_statusContrato_idx" ON "documento_juridico"("statusContrato");

-- AddForeignKey
ALTER TABLE "documento_juridico" ADD CONSTRAINT "documento_juridico_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "vinculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_juridico" ADD CONSTRAINT "documento_juridico_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
