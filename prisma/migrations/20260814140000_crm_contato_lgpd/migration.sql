-- CRM Fase 1b (F1.9): campos de LGPD e CRM no contato do cliente.
--
-- Aditiva. Os dois NOT NULL (baseLegal, statusRelacionamento) têm DEFAULT, e createdAt usa
-- CURRENT_TIMESTAMP — seguro em tabela populada. Todo o resto é nullable.
--
-- Contexto: hoje há ZERO contatos, tanto em produção quanto em dev. Ou seja, esta migration
-- não converte nada; ela prepara o terreno para os contatos que a Fase 1 vai passar a criar.

-- AlterTable
ALTER TABLE "contato_cliente" ADD COLUMN     "baseLegal" "BaseLegalLgpd" NOT NULL DEFAULT 'LEGITIMO_INTERESSE',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dataCollectedAt" TIMESTAMP(3),
ADD COLUMN     "dataCollectionSource" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "optOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ADD COLUMN     "papelDecisao" TEXT,
ADD COLUMN     "salesNavigatorUrl" TEXT,
ADD COLUMN     "statusRelacionamento" "StatusRelacionamentoContato" NOT NULL DEFAULT 'ATIVO';
-- CreateIndex
CREATE INDEX "contato_cliente_optOut_idx" ON "contato_cliente"("optOut");

-- Backfill de dataCollectedAt (Q5): a data de coleta de um contato pré-existente é
-- desconhecida, e a decisão registrada foi usar createdAt como proxy.
--
-- ⚠️ RESSALVA HONESTA: para linhas que já existiam, `createdAt` acabou de ser preenchido com a
-- data DESTA MIGRATION, não com a data real do cadastro — o dado nunca foi guardado. O proxy
-- vale para os contatos criados daqui em diante; para os antigos ele é apenas o instante em que
-- a coluna nasceu. Como a tabela está vazia, o UPDATE abaixo não afeta linha alguma hoje; fica
-- pelo caso de algum ambiente ter contatos que não conhecemos.
UPDATE "contato_cliente" SET "dataCollectedAt" = "createdAt" WHERE "dataCollectedAt" IS NULL;
