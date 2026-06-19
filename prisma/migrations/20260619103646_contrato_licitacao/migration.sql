-- CreateTable
CREATE TABLE "contrato_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "numeroContrato" TEXT,
    "numeroEmpenho" TEXT,
    "valorHomologado" DECIMAL(14,2) NOT NULL,
    "vigenciaInicio" DATE,
    "vigenciaFim" DATE,
    "reajuste" TEXT,
    "garantiaTipo" TEXT,
    "garantiaValor" DECIMAL(14,2),
    "garantiaValidade" DATE,
    "limiteAcrescimoPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aditivo_contrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valorDelta" DECIMAL(14,2),
    "novaVigencia" DATE,
    "justificativa" TEXT,
    "data" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aditivo_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contrato_licitacao_licitacaoId_key" ON "contrato_licitacao"("licitacaoId");

-- CreateIndex
CREATE INDEX "aditivo_contrato_contratoId_idx" ON "aditivo_contrato"("contratoId");

-- AddForeignKey
ALTER TABLE "contrato_licitacao" ADD CONSTRAINT "contrato_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivo_contrato" ADD CONSTRAINT "aditivo_contrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contrato_licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
