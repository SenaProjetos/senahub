-- CreateEnum
CREATE TYPE "StatusFechamento" AS ENUM ('aberto', 'fechado');

-- CreateTable
CREATE TABLE "fechamento_mensal" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "status" "StatusFechamento" NOT NULL DEFAULT 'aberto',
    "receitaConfirmada" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "despesaConfirmada" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "folhaBruta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retencaoIss" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retencaoInss" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retencaoIr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descontos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "aliquotas" JSONB,
    "observacoes" TEXT,
    "responsavelId" TEXT NOT NULL,
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fechamento_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fechamento_mensal_status_idx" ON "fechamento_mensal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fechamento_mensal_ano_mes_key" ON "fechamento_mensal"("ano", "mes");

-- AddForeignKey
ALTER TABLE "fechamento_mensal" ADD CONSTRAINT "fechamento_mensal_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
