-- CreateTable
CREATE TABLE "link_publico_arquivos" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "disciplinaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_publico_arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_publico_arquivos_projetoId_key" ON "link_publico_arquivos"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "link_publico_arquivos_token_key" ON "link_publico_arquivos"("token");

-- AddForeignKey
ALTER TABLE "link_publico_arquivos" ADD CONSTRAINT "link_publico_arquivos_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
