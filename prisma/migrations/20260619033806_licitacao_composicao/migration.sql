-- CreateTable
CREATE TABLE "licitacao_composicao_preco" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "observacao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licitacao_composicao_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_composicao_licitacao" (
    "id" TEXT NOT NULL,
    "composicaoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "item_composicao_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licitacao_composicao_preco_licitacaoId_key" ON "licitacao_composicao_preco"("licitacaoId");

-- CreateIndex
CREATE INDEX "item_composicao_licitacao_composicaoId_idx" ON "item_composicao_licitacao"("composicaoId");

-- AddForeignKey
ALTER TABLE "licitacao_composicao_preco" ADD CONSTRAINT "licitacao_composicao_preco_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_composicao_licitacao" ADD CONSTRAINT "item_composicao_licitacao_composicaoId_fkey" FOREIGN KEY ("composicaoId") REFERENCES "licitacao_composicao_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;
