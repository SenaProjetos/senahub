-- CRM Fase 1c (F1.19): PropostaItem.disciplina (texto livre) ganha FK para o catálogo.
--
-- ⚠️ A COLUNA FÍSICA `disciplina` NÃO é renomeada. No schema Prisma ela passa a se chamar
-- `disciplinaTextoLegado` via `@map("disciplina")` — o nome muda só no código, o dado não se
-- move. Isso evita um RENAME numa tabela ligada ao fluxo de proposta (link público já enviado a
-- cliente) e faz os 9 pontos de leitura falharem em COMPILAÇÃO, não em runtime.
--
-- `disciplinaId` é NULLABLE de propósito: produção tem 24 grafias, 18 batendo exato com o
-- catálogo e 6 precisando de tratamento manual (F1.21). Item que não resolve fica sem FK — é
-- estado esperado, e o texto legado continua sendo exibido como fallback.

-- AlterTable
ALTER TABLE "proposta_item" ADD COLUMN     "disciplinaId" TEXT;

-- CreateIndex
CREATE INDEX "proposta_item_disciplinaId_idx" ON "proposta_item"("disciplinaId");

-- AddForeignKey
ALTER TABLE "proposta_item" ADD CONSTRAINT "proposta_item_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: casa o texto com o catálogo por nome EXATO. O que não casar fica NULL de
-- propósito — resolver as grafias divergentes é trabalho manual da F1.21, com o dado de
-- produção à vista. Casar por aproximação aqui arriscaria apontar o item para a disciplina
-- errada, e valor de disciplina vira pagamento de projetista.
UPDATE "proposta_item" pi
SET "disciplinaId" = dc.id
FROM "disciplina_catalogo" dc
WHERE dc.nome = pi."disciplina" AND pi."disciplinaId" IS NULL;
