-- CRM Fase 2 (F2.1b, ADR-17): `Compromisso` ganha a âncora e o tipo da Próxima Ação comercial.
--
-- TUDO NULLABLE — 100% aditivo. Todo `Compromisso` existente continua válido com os 5 campos em
-- null, exatamente o comportamento de hoje. `entidadeTipo`/`entidadeId` são âncora polimórfica
-- SEM FK (mesmo padrão de ApontamentoCoordenacao/Pendencia): a entidade referenciada pode ser
-- Lead, Negociacao ou Cliente, e nenhuma FK única cobriria as três.
--
-- Esta migration NÃO escreve dado nenhum: os dois índices existem porque a F2.1a (filtro da
-- agenda) e a F2.10 (schema da Próxima Ação) vão consultar por eles, mas nenhuma tarefa desta
-- migration cria Compromisso com `tipo` preenchido — isso só começa na F2.10.

-- CreateEnum
CREATE TYPE "TipoAncoraCompromisso" AS ENUM ('LEAD', 'NEGOCIACAO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "TipoProximaAcao" AS ENUM ('LIGACAO', 'WHATSAPP', 'EMAIL', 'LINKEDIN', 'REUNIAO', 'FOLLOW_UP', 'COBRAR_DOCUMENTACAO', 'COBRAR_ARQUITETURA', 'ENVIAR_PROPOSTA', 'REVISAR_PROPOSTA', 'RETORNO_AO_CLIENTE', 'OUTRO');

-- AlterTable
ALTER TABLE "compromisso" ADD COLUMN     "entidadeTipo" "TipoAncoraCompromisso",
ADD COLUMN     "entidadeId" TEXT,
ADD COLUMN     "tipo" "TipoProximaAcao",
ADD COLUMN     "concluidoEm" TIMESTAMP(3),
ADD COLUMN     "concluidoPor" TEXT;

-- CreateIndex
CREATE INDEX "compromisso_entidadeTipo_entidadeId_idx" ON "compromisso"("entidadeTipo", "entidadeId");

-- CreateIndex
CREATE INDEX "compromisso_tipo_concluidoEm_idx" ON "compromisso"("tipo", "concluidoEm");
