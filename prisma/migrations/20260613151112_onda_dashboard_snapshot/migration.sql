-- CreateTable
CREATE TABLE "dashboard_snapshot" (
    "id" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "projetosAtivos" INTEGER NOT NULL,
    "receitaPrevista" DECIMAL(14,2) NOT NULL,
    "entregasPendentes" INTEGER NOT NULL,
    "recebidoNoMes" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_snapshot_dia_key" ON "dashboard_snapshot"("dia");
