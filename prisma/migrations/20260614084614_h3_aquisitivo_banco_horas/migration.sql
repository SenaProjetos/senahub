-- AlterTable
ALTER TABLE "user" ADD COLUMN     "dataAdmissao" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "banco_horas_mensal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "saldoMinutos" INTEGER NOT NULL,
    "acumuladoMinutos" INTEGER NOT NULL,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banco_horas_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banco_horas_mensal_userId_idx" ON "banco_horas_mensal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "banco_horas_mensal_userId_ano_mes_key" ON "banco_horas_mensal"("userId", "ano", "mes");

-- AddForeignKey
ALTER TABLE "banco_horas_mensal" ADD CONSTRAINT "banco_horas_mensal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
