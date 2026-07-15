-- CreateTable
CREATE TABLE "padrao_tecnico" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT,
    "disciplinaId" TEXT,
    "arquivoPath" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "mime" TEXT,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT,
    "autorId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "padrao_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "norma_tecnica" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "arquivoPath" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "mime" TEXT,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT,
    "autorId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "norma_tecnica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "padrao_tecnico_disciplinaId_idx" ON "padrao_tecnico"("disciplinaId");

-- CreateIndex
CREATE INDEX "norma_tecnica_numero_idx" ON "norma_tecnica"("numero");

-- AddForeignKey
ALTER TABLE "padrao_tecnico" ADD CONSTRAINT "padrao_tecnico_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
