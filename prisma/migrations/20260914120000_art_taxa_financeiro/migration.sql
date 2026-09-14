-- Taxa de ART/RRT/TRT vira custo direto do projeto no Financeiro.
-- SQL escrito à mão (skill nova-migracao): mudança só aditiva.
--
-- Não há backfill: ARTs antigas com `valor` só ganham lançamento quando forem editadas.
-- Em 2026-09-14 o dono confirmou que não existe nenhum lançamento de ART em produção,
-- então não há o que deduplicar.

-- AlterTable
ALTER TABLE "art" ADD COLUMN "custeio" TEXT NOT NULL DEFAULT 'empresa';
ALTER TABLE "art" ADD COLUMN "lancamentoId" TEXT;
ALTER TABLE "art" ADD COLUMN "reembolsoLancamentoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "art_lancamentoId_key" ON "art"("lancamentoId");
CREATE UNIQUE INDEX "art_reembolsoLancamentoId_key" ON "art"("reembolsoLancamentoId");

-- Conta 2.09 do plano de contas. Também está na seed; criada aqui para que o deploy não
-- dependa de `db:seed` (sem a conta, salvar ART com taxa falha).
INSERT INTO "categoria_financeira" ("id", "codigo", "nome", "tipo", "paiId", "ordem", "ativo")
SELECT gen_random_uuid()::text, '2.09', 'Taxas de ART/RRT', 'despesa',
       (SELECT "id" FROM "categoria_financeira" WHERE "codigo" = '2'), 13, true
ON CONFLICT ("codigo") DO NOTHING;
