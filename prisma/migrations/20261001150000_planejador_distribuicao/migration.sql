-- Planejador de caixa (F5): regras de distribuição e recebimentos a distribuir. Aditiva: tabelas novas,
-- um enum novo e uma coluna anulável em movimento_caixinha. Nenhuma regra é criada: quem define os
-- percentuais é o dono, em /financeiro/distribuicao.
-- CreateEnum
CREATE TYPE "SituacaoDistribuicao" AS ENUM ('distribuida', 'pulada');

-- AlterTable
ALTER TABLE "movimento_caixinha" ADD COLUMN     "distribuicaoId" TEXT;

-- CreateTable
CREATE TABLE "regra_distribuicao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "categoriasIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regra_distribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regra_distribuicao_item" (
    "id" TEXT NOT NULL,
    "regraId" TEXT NOT NULL,
    "caixinhaId" TEXT,
    "bp" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "regra_distribuicao_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribuicao_recebimento" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "regraId" TEXT,
    "situacao" "SituacaoDistribuicao" NOT NULL,
    "data" DATE NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribuicao_recebimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regra_distribuicao_ativa_idx" ON "regra_distribuicao"("ativa");

-- CreateIndex
CREATE INDEX "regra_distribuicao_item_regraId_ordem_idx" ON "regra_distribuicao_item"("regraId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "distribuicao_recebimento_lancamentoId_key" ON "distribuicao_recebimento"("lancamentoId");

-- CreateIndex
CREATE INDEX "movimento_caixinha_distribuicaoId_idx" ON "movimento_caixinha"("distribuicaoId");

-- AddForeignKey
ALTER TABLE "movimento_caixinha" ADD CONSTRAINT "movimento_caixinha_distribuicaoId_fkey" FOREIGN KEY ("distribuicaoId") REFERENCES "distribuicao_recebimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_distribuicao_item" ADD CONSTRAINT "regra_distribuicao_item_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "regra_distribuicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_distribuicao_item" ADD CONSTRAINT "regra_distribuicao_item_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribuicao_recebimento" ADD CONSTRAINT "distribuicao_recebimento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribuicao_recebimento" ADD CONSTRAINT "distribuicao_recebimento_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "regra_distribuicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribuicao_recebimento" ADD CONSTRAINT "distribuicao_recebimento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

