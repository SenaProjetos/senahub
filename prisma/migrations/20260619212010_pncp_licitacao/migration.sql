-- AlterTable
ALTER TABLE "licitacao" ADD COLUMN     "numeroControlePNCP" TEXT,
ADD COLUMN     "origemPNCP" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pncpUrl" TEXT,
ADD COLUMN     "publicadoPNCPEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "integracao_pncp_log" (
    "id" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "referencia" TEXT,
    "licitacaoId" TEXT,
    "status" TEXT NOT NULL,
    "mensagem" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integracao_pncp_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integracao_pncp_log_licitacaoId_idx" ON "integracao_pncp_log"("licitacaoId");

-- AddForeignKey
ALTER TABLE "integracao_pncp_log" ADD CONSTRAINT "integracao_pncp_log_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
