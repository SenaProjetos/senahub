-- CreateEnum
CREATE TYPE "StatusOportunidade" AS ENUM ('aberta', 'ganha', 'perdida');

-- CreateTable
CREATE TABLE "oportunidade" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "clienteId" TEXT,
    "valorEstimado" DECIMAL(14,2),
    "etapa" TEXT NOT NULL DEFAULT 'qualificacao',
    "status" "StatusOportunidade" NOT NULL DEFAULT 'aberta',
    "responsavelId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividade_oportunidade" (
    "id" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'nota',
    "descricao" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividade_oportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_anexo" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oportunidade_status_idx" ON "oportunidade"("status");

-- CreateIndex
CREATE INDEX "atividade_oportunidade_oportunidadeId_idx" ON "atividade_oportunidade"("oportunidadeId");

-- CreateIndex
CREATE INDEX "proposta_anexo_propostaId_idx" ON "proposta_anexo"("propostaId");

-- AddForeignKey
ALTER TABLE "atividade_oportunidade" ADD CONSTRAINT "atividade_oportunidade_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
