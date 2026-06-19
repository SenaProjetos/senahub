-- CreateTable
CREATE TABLE "licitacao_metrica_mensal" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "totalAbertas" INTEGER NOT NULL DEFAULT 0,
    "totalGanhas" INTEGER NOT NULL DEFAULT 0,
    "totalPerdidas" INTEGER NOT NULL DEFAULT 0,
    "valorGanho" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorPerdido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorEmDisputa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_metrica_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licitacao_metrica_mensal_ano_mes_key" ON "licitacao_metrica_mensal"("ano", "mes");
