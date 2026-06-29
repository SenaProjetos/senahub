-- CreateTable
CREATE TABLE "briefing_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "respostasJson" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'nao_iniciado',
    "preenchidoPor" TEXT,
    "preenchidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "briefing_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "briefing_projeto_projetoId_key" ON "briefing_projeto"("projetoId");

-- AddForeignKey
ALTER TABLE "briefing_projeto" ADD CONSTRAINT "briefing_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
