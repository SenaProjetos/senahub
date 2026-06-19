-- CreateTable
CREATE TABLE "matriz_risco_item" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "probabilidade" TEXT NOT NULL,
    "impacto" TEXT NOT NULL,
    "alocacao" TEXT NOT NULL,
    "mitigacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "matriz_risco_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reajuste_contrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "indice" TEXT NOT NULL,
    "percentual" DECIMAL(6,3) NOT NULL,
    "dataBase" DATE,
    "aniversario" DATE NOT NULL,
    "valorAnterior" DECIMAL(14,2) NOT NULL,
    "valorReajustado" DECIMAL(14,2) NOT NULL,
    "aplicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reajuste_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matriz_risco_item_contratoId_idx" ON "matriz_risco_item"("contratoId");

-- CreateIndex
CREATE INDEX "reajuste_contrato_contratoId_idx" ON "reajuste_contrato"("contratoId");

-- CreateIndex
CREATE INDEX "reajuste_contrato_aniversario_idx" ON "reajuste_contrato"("aniversario");

-- AddForeignKey
ALTER TABLE "matriz_risco_item" ADD CONSTRAINT "matriz_risco_item_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contrato_licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reajuste_contrato" ADD CONSTRAINT "reajuste_contrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contrato_licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
