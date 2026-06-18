-- CreateEnum
CREATE TYPE "StatusPlanejamento" AS ENUM ('rascunho', 'analise', 'aprovado', 'executado', 'cancelado');

-- CreateTable
CREATE TABLE "planejamento_pagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "StatusPlanejamento" NOT NULL DEFAULT 'rascunho',
    "saldoDisponivel" DECIMAL(14,2) NOT NULL,
    "periodoIni" DATE,
    "periodoFim" DATE,
    "contaId" TEXT,
    "centroId" TEXT,
    "projetoId" TEXT,
    "observacoes" TEXT,
    "responsavelId" TEXT NOT NULL,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "executadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planejamento_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planejamento_linha" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "valorPlanejado" DECIMAL(14,2) NOT NULL,
    "selecionada" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "planejamento_linha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planejamento_pagamento_status_idx" ON "planejamento_pagamento"("status");

-- CreateIndex
CREATE INDEX "planejamento_linha_planoId_idx" ON "planejamento_linha"("planoId");

-- CreateIndex
CREATE UNIQUE INDEX "planejamento_linha_planoId_lancamentoId_key" ON "planejamento_linha"("planoId", "lancamentoId");

-- AddForeignKey
ALTER TABLE "planejamento_pagamento" ADD CONSTRAINT "planejamento_pagamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "conta_bancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_pagamento" ADD CONSTRAINT "planejamento_pagamento_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_pagamento" ADD CONSTRAINT "planejamento_pagamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_pagamento" ADD CONSTRAINT "planejamento_pagamento_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_linha" ADD CONSTRAINT "planejamento_linha_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planejamento_pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_linha" ADD CONSTRAINT "planejamento_linha_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
