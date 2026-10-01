-- Planejador de caixa (F6A): compromissos recorrentes (ADR-0009). Aditiva: uma tabela e um enum novos,
-- e em lancamento as colunas socioId, recorrenciaOrigemId e recorrenciaCompetencia (FKs SET NULL).
-- O par (recorrenciaOrigemId, recorrenciaCompetencia) é único: um mês vinculado nunca é gerado duas vezes.
-- CreateEnum
CREATE TYPE "PeriodicidadeRecorrencia" AS ENUM ('mensal');

-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "recorrenciaCompetencia" TEXT,
ADD COLUMN     "recorrenciaOrigemId" TEXT,
ADD COLUMN     "socioId" TEXT;

-- CreateTable
CREATE TABLE "compromisso_recorrente" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "periodicidade" "PeriodicidadeRecorrencia" NOT NULL DEFAULT 'mensal',
    "competenciaInicio" TEXT NOT NULL,
    "competenciaFim" TEXT,
    "categoriaId" TEXT NOT NULL,
    "socioId" TEXT,
    "caixinhaId" TEXT,
    "prioridade" "PrioridadePagamento",
    "antecedenciaDias" INTEGER NOT NULL DEFAULT 5,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compromisso_recorrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compromisso_recorrente_ativo_idx" ON "compromisso_recorrente"("ativo");

-- CreateIndex
CREATE INDEX "lancamento_socioId_idx" ON "lancamento"("socioId");

-- CreateIndex
CREATE UNIQUE INDEX "lancamento_recorrenciaOrigemId_recorrenciaCompetencia_key" ON "lancamento"("recorrenciaOrigemId", "recorrenciaCompetencia");

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_recorrenciaOrigemId_fkey" FOREIGN KEY ("recorrenciaOrigemId") REFERENCES "compromisso_recorrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso_recorrente" ADD CONSTRAINT "compromisso_recorrente_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria_financeira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso_recorrente" ADD CONSTRAINT "compromisso_recorrente_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso_recorrente" ADD CONSTRAINT "compromisso_recorrente_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

