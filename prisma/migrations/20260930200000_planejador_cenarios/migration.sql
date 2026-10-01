-- Planejador de caixa (F3): cenários salvos. Aditiva: duas tabelas novas e um enum, sem tocar em dados.
-- Spec docs/superpowers/specs/2026-09-30-planejador-financeiro.md §6 e §11; plano I8 (FK do alvo com SET NULL).
-- CreateEnum
CREATE TYPE "SituacaoCenario" AS ENUM ('rascunho', 'aplicado', 'arquivado');

-- CreateTable
CREATE TABLE "cenario_financeiro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "premissas" JSONB NOT NULL,
    "situacao" "SituacaoCenario" NOT NULL DEFAULT 'rascunho',
    "criadoPorId" TEXT NOT NULL,
    "aplicadoEm" TIMESTAMP(3),
    "aplicadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cenario_financeiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste_cenario" (
    "id" TEXT NOT NULL,
    "cenarioId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "alvo" JSONB NOT NULL,
    "antes" JSONB,
    "depois" JSONB NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadoEm" TIMESTAMP(3),
    "aplicadoPorId" TEXT,

    CONSTRAINT "ajuste_cenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cenario_financeiro_situacao_updatedAt_idx" ON "cenario_financeiro"("situacao", "updatedAt");

-- CreateIndex
CREATE INDEX "ajuste_cenario_cenarioId_ordem_idx" ON "ajuste_cenario"("cenarioId", "ordem");

-- CreateIndex
CREATE INDEX "ajuste_cenario_lancamentoId_idx" ON "ajuste_cenario"("lancamentoId");

-- AddForeignKey
ALTER TABLE "cenario_financeiro" ADD CONSTRAINT "cenario_financeiro_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_cenario" ADD CONSTRAINT "ajuste_cenario_cenarioId_fkey" FOREIGN KEY ("cenarioId") REFERENCES "cenario_financeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_cenario" ADD CONSTRAINT "ajuste_cenario_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

