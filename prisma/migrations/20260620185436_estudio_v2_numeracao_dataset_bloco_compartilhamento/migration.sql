-- AlterTable
ALTER TABLE "documento_gerado" ADD COLUMN     "numero" INTEGER,
ADD COLUMN     "serie" TEXT;

-- AlterTable
ALTER TABLE "documento_modelo" ADD COLUMN     "donoId" TEXT,
ADD COLUMN     "perfis" "Role"[] DEFAULT ARRAY[]::"Role"[],
ADD COLUMN     "visibilidade" TEXT NOT NULL DEFAULT 'global';

-- CreateTable
CREATE TABLE "dataset_documento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "colunas" JSONB NOT NULL,
    "linhas" JSONB NOT NULL,
    "donoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dataset_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloco_documento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "conteudo" JSONB NOT NULL,
    "donoId" TEXT,
    "compartilhado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloco_documento_pkey" PRIMARY KEY ("id")
);
