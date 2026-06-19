-- CreateTable
CREATE TABLE "viabilidade_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "modo" TEXT NOT NULL DEFAULT 'fixo',
    "margemEsperadaPct" DECIMAL(5,2),
    "equipeDisponivel" BOOLEAN,
    "concorrenciaPrevista" TEXT,
    "decisao" TEXT NOT NULL DEFAULT 'pendente',
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "justificativa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viabilidade_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viabilidade_criterio" (
    "id" TEXT NOT NULL,
    "viabilidadeId" TEXT NOT NULL,
    "criterio" TEXT NOT NULL,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "viabilidade_criterio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "viabilidade_licitacao_licitacaoId_key" ON "viabilidade_licitacao"("licitacaoId");

-- CreateIndex
CREATE INDEX "viabilidade_criterio_viabilidadeId_idx" ON "viabilidade_criterio"("viabilidadeId");

-- AddForeignKey
ALTER TABLE "viabilidade_licitacao" ADD CONSTRAINT "viabilidade_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viabilidade_licitacao" ADD CONSTRAINT "viabilidade_licitacao_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viabilidade_criterio" ADD CONSTRAINT "viabilidade_criterio_viabilidadeId_fkey" FOREIGN KEY ("viabilidadeId") REFERENCES "viabilidade_licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
