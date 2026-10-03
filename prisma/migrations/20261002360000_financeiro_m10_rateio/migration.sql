-- CreateTable
CREATE TABLE "lancamento_rateio" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "centroId" TEXT,
    "projetoId" TEXT,
    "percentualBp" INTEGER NOT NULL,

    CONSTRAINT "lancamento_rateio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lancamento_rateio_lancamentoId_idx" ON "lancamento_rateio"("lancamentoId");

-- CreateIndex
CREATE INDEX "lancamento_rateio_centroId_idx" ON "lancamento_rateio"("centroId");

-- CreateIndex
CREATE INDEX "lancamento_rateio_projetoId_idx" ON "lancamento_rateio"("projetoId");

-- AddForeignKey
ALTER TABLE "lancamento_rateio" ADD CONSTRAINT "lancamento_rateio_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_rateio" ADD CONSTRAINT "lancamento_rateio_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_rateio" ADD CONSTRAINT "lancamento_rateio_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
