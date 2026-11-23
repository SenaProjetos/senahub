-- CreateEnum
CREATE TYPE "MudancaReuniaoAgendada" AS ENUM ('remarcada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoReuniaoAgendada" AS ENUM ('agendada', 'cancelada');

-- CreateTable
CREATE TABLE "marco_agenda_portal" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "marcoId" TEXT NOT NULL,
    "nota" TEXT,
    "notaPorId" TEXT,
    "notaEm" TIMESTAMP(3),
    "previsaoVista" DATE,
    "previsaoAnterior" DATE,
    "previsaoAlteradaEm" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marco_agenda_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reuniao_agendada" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "duracaoMinutos" INTEGER,
    "link" TEXT,
    "local" TEXT,
    "pauta" TEXT,
    "estado" "EstadoReuniaoAgendada" NOT NULL DEFAULT 'agendada',
    "motivoCancelamento" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "diaAnterior" DATE,
    "horaAnterior" TEXT,
    "mudancaEm" DATE,
    "mudancaTipo" "MudancaReuniaoAgendada",
    "criadaPorId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reuniaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reuniao_agendada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marco_agenda_portal_marcoId_key" ON "marco_agenda_portal"("marcoId");

-- CreateIndex
CREATE INDEX "marco_agenda_portal_projetoId_idx" ON "marco_agenda_portal"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "reuniao_agendada_reuniaoId_key" ON "reuniao_agendada"("reuniaoId");

-- CreateIndex
CREATE INDEX "reuniao_agendada_projetoId_dia_idx" ON "reuniao_agendada"("projetoId", "dia");

-- AddForeignKey
ALTER TABLE "marco_agenda_portal" ADD CONSTRAINT "marco_agenda_portal_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marco_agenda_portal" ADD CONSTRAINT "marco_agenda_portal_marcoId_fkey" FOREIGN KEY ("marcoId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marco_agenda_portal" ADD CONSTRAINT "marco_agenda_portal_notaPorId_fkey" FOREIGN KEY ("notaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reuniao_agendada" ADD CONSTRAINT "reuniao_agendada_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reuniao_agendada" ADD CONSTRAINT "reuniao_agendada_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reuniao_agendada" ADD CONSTRAINT "reuniao_agendada_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "reuniao_projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

