-- CreateTable
CREATE TABLE "documento_gerado" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT,
    "modeloNome" TEXT NOT NULL,
    "fonte" TEXT,
    "params" JSONB NOT NULL,
    "schemaSnapshot" JSONB NOT NULL,
    "dadosSnapshot" JSONB NOT NULL,
    "geradoPorId" TEXT NOT NULL,
    "geradoPorNome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_gerado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_gerado_modeloId_idx" ON "documento_gerado"("modeloId");

-- CreateIndex
CREATE INDEX "documento_gerado_createdAt_idx" ON "documento_gerado"("createdAt");
