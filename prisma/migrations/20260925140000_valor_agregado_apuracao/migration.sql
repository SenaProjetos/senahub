-- F8 — Valor Agregado apurado em cada Data de Status. O % informado não guarda passado: sem esta
-- foto, a curva VP × VA × CR do projeto não se reconstrói depois (mesmo motivo da foto da Saúde, D42).
-- Aditiva. O índice único (projetoId, dataStatus) já serve de índice da FK.

-- CreateTable
CREATE TABLE "valor_agregado_apuracao" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "dataStatus" DATE NOT NULL,
    "baselineNumero" INTEGER NOT NULL,
    "ontHoras" DECIMAL(12,2),
    "vpHoras" DECIMAL(12,2),
    "vaHoras" DECIMAL(12,2),
    "crHoras" DECIMAL(12,2),
    "ontCusto" DECIMAL(14,2),
    "vpCusto" DECIMAL(14,2),
    "vaCusto" DECIMAL(14,2),
    "crCusto" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "valor_agregado_apuracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "valor_agregado_apuracao_projetoId_dataStatus_key" ON "valor_agregado_apuracao"("projetoId", "dataStatus");

-- AddForeignKey
ALTER TABLE "valor_agregado_apuracao" ADD CONSTRAINT "valor_agregado_apuracao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

