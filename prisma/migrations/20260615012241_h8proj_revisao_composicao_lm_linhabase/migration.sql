-- CreateEnum
CREATE TYPE "StatusSolicRevisao" AS ENUM ('pendente', 'aceita', 'recusada');

-- CreateTable
CREATE TABLE "solicitacao_revisao" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" "StatusSolicRevisao" NOT NULL DEFAULT 'pendente',
    "respostaMotivo" TEXT,
    "anexoPath" TEXT,
    "anexoNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "solicitacao_revisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projeto_composicao_preco" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "observacao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projeto_composicao_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_composicao_preco" (
    "id" TEXT NOT NULL,
    "composicaoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "item_composicao_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lm_config" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lm_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linha_base" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linha_base_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitacao_revisao_disciplinaId_idx" ON "solicitacao_revisao"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "projeto_composicao_preco_projetoId_key" ON "projeto_composicao_preco"("projetoId");

-- CreateIndex
CREATE INDEX "item_composicao_preco_composicaoId_idx" ON "item_composicao_preco"("composicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "lm_config_projetoId_key" ON "lm_config"("projetoId");

-- CreateIndex
CREATE INDEX "linha_base_projetoId_idx" ON "linha_base"("projetoId");

-- AddForeignKey
ALTER TABLE "solicitacao_revisao" ADD CONSTRAINT "solicitacao_revisao_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projeto_composicao_preco" ADD CONSTRAINT "projeto_composicao_preco_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_composicao_preco" ADD CONSTRAINT "item_composicao_preco_composicaoId_fkey" FOREIGN KEY ("composicaoId") REFERENCES "projeto_composicao_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lm_config" ADD CONSTRAINT "lm_config_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linha_base" ADD CONSTRAINT "linha_base_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
