-- CRM Fase 4 (F4.1): lista de prospecção do Sales Navigator em `Cliente`/`ContatoCliente`.
--
-- 100% ADITIVO. `listaSalesNavigator` nasce `false` em todo registro existente (default,
-- NOT NULL sem backfill necessário — não é "todo cliente já era candidato de lista", é o
-- oposto: ninguém é, até alguém marcar). `dataInclusaoLista` fica NULL até essa marcação.
-- `statusAbordagem` nasce `NAO_ABORDADO` — estado inicial correto tanto para quem entrar na
-- lista amanhã quanto para os 46 clientes/contatos que já existem hoje (nenhum foi abordado
-- por ESTE mecanismo, o outbound do Sales Navigator não existia antes desta tarefa).

-- CreateEnum
CREATE TYPE "StatusAbordagem" AS ENUM ('NAO_ABORDADO', 'ABORDADO', 'RESPONDEU', 'SEM_RESPOSTA', 'RECUSADO');

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "listaSalesNavigator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dataInclusaoLista" TIMESTAMP(3),
ADD COLUMN     "statusAbordagem" "StatusAbordagem" NOT NULL DEFAULT 'NAO_ABORDADO';

-- AlterTable
ALTER TABLE "contato_cliente" ADD COLUMN     "listaSalesNavigator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dataInclusaoLista" TIMESTAMP(3),
ADD COLUMN     "statusAbordagem" "StatusAbordagem" NOT NULL DEFAULT 'NAO_ABORDADO';

-- CreateIndex
CREATE INDEX "cliente_listaSalesNavigator_idx" ON "cliente"("listaSalesNavigator");

-- CreateIndex
CREATE INDEX "contato_cliente_listaSalesNavigator_idx" ON "contato_cliente"("listaSalesNavigator");
