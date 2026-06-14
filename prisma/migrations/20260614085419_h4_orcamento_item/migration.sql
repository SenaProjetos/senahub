-- CreateTable
CREATE TABLE "orcamento_item" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "valorPlanejado" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamento_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orcamento_item_ano_idx" ON "orcamento_item"("ano");

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_item_ano_categoriaId_key" ON "orcamento_item"("ano", "categoriaId");

-- AddForeignKey
ALTER TABLE "orcamento_item" ADD CONSTRAINT "orcamento_item_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria_financeira"("id") ON DELETE CASCADE ON UPDATE CASCADE;
