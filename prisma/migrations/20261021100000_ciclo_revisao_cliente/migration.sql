-- Controle "Em revisão" (o cliente está analisando a revisão publicada), envio automático ao cliente
-- e origem da descrição da revisão (lida do carimbo, digitada ou contestada).

-- AlterEnum
ALTER TYPE "TipoControleRevisao" ADD VALUE 'em_revisao';

-- AlterTable: o DEFAULT true preenche os projetos que já existem (decisão do spec 2026-10-21).
ALTER TABLE "config_documentos_projeto" ADD COLUMN "enviarAoClienteAutomaticamente" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "documento_revisao" ADD COLUMN "descricaoOrigem" TEXT,
ADD COLUMN "descricaoCarimbo" TEXT;
