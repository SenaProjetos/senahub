-- CreateTable
CREATE TABLE "rateio_hora" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "minutos" INTEGER NOT NULL,
    "custoHora" DECIMAL(10,2) NOT NULL,
    "custo" DECIMAL(12,2) NOT NULL,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rateio_hora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rateio_hora_projetoId_ano_mes_idx" ON "rateio_hora"("projetoId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "rateio_hora_userId_projetoId_ano_mes_key" ON "rateio_hora"("userId", "projetoId", "ano", "mes");

-- AddForeignKey
ALTER TABLE "rateio_hora" ADD CONSTRAINT "rateio_hora_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rateio_hora" ADD CONSTRAINT "rateio_hora_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
