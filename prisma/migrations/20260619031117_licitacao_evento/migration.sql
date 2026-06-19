-- CreateEnum
CREATE TYPE "TipoEventoLicitacao" AS ENUM ('abertura', 'sessao', 'resultado', 'assinatura', 'vigencia_inicio', 'vigencia_fim', 'pedido_esclarecimento', 'impugnacao', 'recurso', 'contrarrazao');

-- CreateTable
CREATE TABLE "licitacao_evento" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "tipo" "TipoEventoLicitacao" NOT NULL,
    "data" DATE NOT NULL,
    "alertaDias" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "autoria" TEXT,
    "protocolo" TEXT,
    "observacao" TEXT,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "licitacao_evento_licitacaoId_idx" ON "licitacao_evento"("licitacaoId");

-- CreateIndex
CREATE INDEX "licitacao_evento_data_idx" ON "licitacao_evento"("data");

-- AddForeignKey
ALTER TABLE "licitacao_evento" ADD CONSTRAINT "licitacao_evento_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
