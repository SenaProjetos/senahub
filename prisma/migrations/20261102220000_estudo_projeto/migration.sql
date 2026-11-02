-- Lote 5d (2026-11-02): aba Estudos do projeto (levantamento de cargas). Tabela nova, sem backfill.
CREATE TABLE "estudo_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'cargas_eletricas',
    "nome" TEXT NOT NULL,
    "conteudo" JSONB NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoPorId" TEXT NOT NULL,
    "atualizadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estudo_projeto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "estudo_projeto_projetoId_createdAt_idx" ON "estudo_projeto"("projetoId", "createdAt");

ALTER TABLE "estudo_projeto" ADD CONSTRAINT "estudo_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estudo_projeto" ADD CONSTRAINT "estudo_projeto_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estudo_projeto" ADD CONSTRAINT "estudo_projeto_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
