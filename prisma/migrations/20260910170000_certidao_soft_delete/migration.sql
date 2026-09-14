-- Certidão passa a ter soft delete (ADR-11), como Lancamento/Upload/Cliente/Lead.
--
-- POR QUÊ: "excluir" na tela apagava a linha de verdade, e o `onDelete: Cascade` de
-- `certidao_versao` levava junto TODO o histórico de versões — o oposto do que um controle de
-- compliance precisa. Além disso a exclusão era barrada de fato para qualquer certidão vinculada
-- a item de habilitação de licitação (FK), então o botão simplesmente não funcionava nesses casos.
-- Com remoção lógica nada é destruído: versões, auditoria e o vínculo com a licitação continuam.
--
-- 100% ADITIVO e seguro em produção: coluna NULLABLE, sem DEFAULT e sem backfill. Toda certidão
-- existente fica com `excluidoEm = NULL`, que é exatamente "não excluída" — o comportamento de
-- hoje. Nenhuma linha é reescrita.
--
-- O índice existe porque `excluidoEm` passa a entrar em TODA leitura de certidão: a extension de
-- `lib/prisma.ts` injeta `excluidoEm: null` nas leituras top-level a partir de agora.
--
-- ⚠️ Leituras que NÃO passam pela extension (lookup só por `id`, e `findUnique`) precisam do
-- filtro explícito — ver `modules/certidoes/link-publico.ts`, senão um link público já entregue a
-- terceiro continuaria servindo certidão arquivada.

-- AlterTable
ALTER TABLE "certidao" ADD COLUMN "excluidoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "certidao_excluidoEm_idx" ON "certidao"("excluidoEm");
