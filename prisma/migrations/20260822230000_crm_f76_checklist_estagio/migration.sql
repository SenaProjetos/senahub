-- F7.6: checklist SOFT por estágio (nunca hard-gate — moverEstagio não consulta isto).
-- Catálogo nasce vazio (mesmo espírito de canal_aquisicao): ninguém decidiu ainda os itens.

-- CreateTable
CREATE TABLE "checklist_item_padrao" (
    "id" TEXT NOT NULL,
    "estagio" "EstagioNegociacao" NOT NULL,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_item_padrao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negociacao_checklist_item" (
    "id" TEXT NOT NULL,
    "negociacaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "marcadoPorId" TEXT NOT NULL,
    "marcadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negociacao_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_item_padrao_estagio_idx" ON "checklist_item_padrao"("estagio");

-- CreateIndex
CREATE INDEX "negociacao_checklist_item_negociacaoId_idx" ON "negociacao_checklist_item"("negociacaoId");

-- CreateIndex
CREATE INDEX "negociacao_checklist_item_itemId_idx" ON "negociacao_checklist_item"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "negociacao_checklist_item_negociacaoId_itemId_key" ON "negociacao_checklist_item"("negociacaoId", "itemId");

-- AddForeignKey
ALTER TABLE "negociacao_checklist_item" ADD CONSTRAINT "negociacao_checklist_item_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "negociacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao_checklist_item" ADD CONSTRAINT "negociacao_checklist_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "checklist_item_padrao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao_checklist_item" ADD CONSTRAINT "negociacao_checklist_item_marcadoPorId_fkey" FOREIGN KEY ("marcadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
