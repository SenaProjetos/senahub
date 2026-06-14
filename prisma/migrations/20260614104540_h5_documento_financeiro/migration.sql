-- CreateEnum
CREATE TYPE "TipoDocumentoFinanceiro" AS ENUM ('nf_entrada', 'nf_servico', 'contrato', 'proposta', 'medicao');

-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "documentoFinanceiroId" TEXT;

-- CreateTable
CREATE TABLE "documento_financeiro" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumentoFinanceiro" NOT NULL,
    "numero" TEXT,
    "dataEmissao" DATE,
    "valorDocumento" DECIMAL(14,2),
    "fornecedorId" TEXT,
    "clienteId" TEXT,
    "referenciaId" TEXT,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "arquivoMime" TEXT,
    "observacao" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_financeiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_financeiro_tipo_idx" ON "documento_financeiro"("tipo");

-- CreateIndex
CREATE INDEX "lancamento_documentoFinanceiroId_idx" ON "lancamento"("documentoFinanceiroId");

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_documentoFinanceiroId_fkey" FOREIGN KEY ("documentoFinanceiroId") REFERENCES "documento_financeiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
