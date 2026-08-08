-- Fase C dos apontamentos: item 11 (classificação), 24 (soft delete) e 39 (thread de resposta).
-- Todas as colunas novas são NULLABLE — tabela populada em produção, sem backfill possível
-- (severidade/tipo não dá pra inferir do texto livre; excluidoEm nulo = não excluído).

-- item 11 — classificação estruturada
ALTER TABLE "pendencia" ADD COLUMN "severidade" TEXT;
ALTER TABLE "pendencia" ADD COLUMN "tipo" TEXT;

-- item 24 — soft delete (a partir daqui `excluirPendencia` deixa de dar DELETE)
ALTER TABLE "pendencia" ADD COLUMN "excluidoEm" TIMESTAMP(3);
ALTER TABLE "pendencia" ADD COLUMN "excluidoPorId" TEXT;

CREATE INDEX "pendencia_excluidoPorId_idx" ON "pendencia"("excluidoPorId");

ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_excluidoPorId_fkey"
  FOREIGN KEY ("excluidoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- item 39 — thread de resposta (tabela nasce vazia, sem backfill)
CREATE TABLE "pendencia_resposta" (
    "id" TEXT NOT NULL,
    "pendenciaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendencia_resposta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pendencia_resposta_pendenciaId_createdAt_idx" ON "pendencia_resposta"("pendenciaId", "createdAt");
CREATE INDEX "pendencia_resposta_autorId_idx" ON "pendencia_resposta"("autorId");

ALTER TABLE "pendencia_resposta" ADD CONSTRAINT "pendencia_resposta_pendenciaId_fkey"
  FOREIGN KEY ("pendenciaId") REFERENCES "pendencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pendencia_resposta" ADD CONSTRAINT "pendencia_resposta_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
