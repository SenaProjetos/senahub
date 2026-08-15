-- CRM Fase 1c (F1.20): ItemTabelaPreco.disciplina ganha FK para o catálogo (mesmo padrão da F1.19).
--
-- Coluna física NÃO renomeada (@map("disciplina") no Prisma). A unique constraint existente
-- em (tabelaId, disciplina) continua intacta — nada muda estruturalmente no banco além da
-- coluna e da FK novas.
--
-- disciplinaId é NULLABLE: item "extra" (fora do catálogo, digitado à mão na tela de tabelas)
-- fica sem FK. A tela já preenche a maioria a partir de `catalogoDisciplinas()`, então o
-- backfill por nome exato deve resolver quase tudo.

-- AlterTable
ALTER TABLE "item_tabela_preco" ADD COLUMN     "disciplinaId" TEXT;

-- CreateIndex
CREATE INDEX "item_tabela_preco_disciplinaId_idx" ON "item_tabela_preco"("disciplinaId");

-- AddForeignKey
ALTER TABLE "item_tabela_preco" ADD CONSTRAINT "item_tabela_preco_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill por nome EXATO — mesmo racional da F1.19: casar por aproximação arriscaria apontar
-- o item para a disciplina errada.
UPDATE "item_tabela_preco" it
SET "disciplinaId" = dc.id
FROM "disciplina_catalogo" dc
WHERE dc.nome = it."disciplina" AND it."disciplinaId" IS NULL;
