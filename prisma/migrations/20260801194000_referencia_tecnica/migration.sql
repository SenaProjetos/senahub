-- CreateTable
CREATE TABLE "referencia_tecnica" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autorObra" TEXT,
    "ano" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "descricao" TEXT,
    "linkExterno" TEXT,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "mime" TEXT,
    "tamanho" INTEGER,
    "hashSha256" TEXT,
    "autorId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referencia_tecnica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referencia_tecnica_tipo_idx" ON "referencia_tecnica"("tipo");
