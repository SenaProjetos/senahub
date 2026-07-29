-- Engenharia de Custos, Onda C2 — vínculo item ↔ composição e materialização do custo.
-- Plano: docs/superpowers/plans/2026-07-28-custos-c2-orcamento.md
--
-- Puramente aditiva: 4 colunas nullable + 3 índices + 3 FKs. Nenhum DROP, nenhum NOT NULL
-- sobre tabela populada.
--
-- `custo_orcamento.basePrecoId`: de qual CustoBasePreco os custos são resolvidos. Trocar esta
-- FK É a "troca de data-base" do briefing (o relatório de impacto compara os dois lados).
-- `custo_orcamento_item.basePrecoUsadaId` + `custoCalculadoEm`: MATERIALIZAÇÃO — de onde e
-- quando o `custoUnitario` já gravado veio. Todas as FKs são ON DELETE SET NULL de propósito:
-- apagar uma base de preço não pode apagar orçamento nem zerar custo histórico já materializado.

-- AlterTable
ALTER TABLE "custo_orcamento" ADD COLUMN     "basePrecoId" TEXT;

-- AlterTable
ALTER TABLE "custo_orcamento_item" ADD COLUMN     "basePrecoUsadaId" TEXT,
ADD COLUMN     "composicaoId" TEXT,
ADD COLUMN     "custoCalculadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "custo_orcamento_basePrecoId_idx" ON "custo_orcamento"("basePrecoId");

-- CreateIndex
CREATE INDEX "custo_orcamento_item_basePrecoUsadaId_idx" ON "custo_orcamento_item"("basePrecoUsadaId");

-- CreateIndex
CREATE INDEX "custo_orcamento_item_composicaoId_idx" ON "custo_orcamento_item"("composicaoId");

-- AddForeignKey
ALTER TABLE "custo_orcamento" ADD CONSTRAINT "custo_orcamento_basePrecoId_fkey" FOREIGN KEY ("basePrecoId") REFERENCES "custo_base_preco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento_item" ADD CONSTRAINT "custo_orcamento_item_basePrecoUsadaId_fkey" FOREIGN KEY ("basePrecoUsadaId") REFERENCES "custo_base_preco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento_item" ADD CONSTRAINT "custo_orcamento_item_composicaoId_fkey" FOREIGN KEY ("composicaoId") REFERENCES "custo_composicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
