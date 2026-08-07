-- Solicitação de exclusão de arquivo de disciplina: quem não pode excluir pede, com
-- justificativa; admin aprova (aí sim vai para a lixeira) ou recusa. Tabela nova, nasce
-- vazia — sem backfill. Os pedidos decididos ficam (histórico de quem pediu/decidiu).

CREATE TYPE "StatusSolicitacaoExclusao" AS ENUM ('pendente', 'aprovada', 'recusada');

CREATE TABLE "solicitacao_exclusao_upload" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" "StatusSolicitacaoExclusao" NOT NULL DEFAULT 'pendente',
    "solicitanteId" TEXT NOT NULL,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacao_exclusao_upload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitacao_exclusao_upload_status_createdAt_idx" ON "solicitacao_exclusao_upload"("status", "createdAt");
CREATE INDEX "solicitacao_exclusao_upload_uploadId_idx" ON "solicitacao_exclusao_upload"("uploadId");
CREATE INDEX "solicitacao_exclusao_upload_projetoId_status_idx" ON "solicitacao_exclusao_upload"("projetoId", "status");
CREATE INDEX "solicitacao_exclusao_upload_solicitanteId_idx" ON "solicitacao_exclusao_upload"("solicitanteId");
CREATE INDEX "solicitacao_exclusao_upload_decididoPorId_idx" ON "solicitacao_exclusao_upload"("decididoPorId");

-- No máximo UM pedido pendente por arquivo (o Prisma não expressa índice parcial —
-- a action também checa, isto é a rede de segurança contra corrida).
CREATE UNIQUE INDEX "solicitacao_exclusao_upload_pendente_unico"
  ON "solicitacao_exclusao_upload"("uploadId") WHERE "status" = 'pendente';

ALTER TABLE "solicitacao_exclusao_upload" ADD CONSTRAINT "solicitacao_exclusao_upload_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitacao_exclusao_upload" ADD CONSTRAINT "solicitacao_exclusao_upload_solicitanteId_fkey"
  FOREIGN KEY ("solicitanteId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "solicitacao_exclusao_upload" ADD CONSTRAINT "solicitacao_exclusao_upload_decididoPorId_fkey"
  FOREIGN KEY ("decididoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
