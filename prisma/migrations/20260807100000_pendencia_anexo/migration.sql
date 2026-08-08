-- Item 12: anexos do apontamento (print, foto, áudio, PDF ou link externo).
-- Tabela nova, nasce vazia — sem backfill. Sem transcrição de áudio (R5): o áudio é
-- guardado como arquivo bruto.

CREATE TABLE "pendencia_anexo" (
    "id" TEXT NOT NULL,
    "pendenciaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'arquivo',
    "nome" TEXT NOT NULL,
    "caminho" TEXT,
    "nomeArquivo" TEXT,
    "mime" TEXT,
    "tamanho" INTEGER,
    "hashSha256" TEXT,
    "url" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendencia_anexo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pendencia_anexo_pendenciaId_createdAt_idx" ON "pendencia_anexo"("pendenciaId", "createdAt");
CREATE INDEX "pendencia_anexo_autorId_idx" ON "pendencia_anexo"("autorId");

ALTER TABLE "pendencia_anexo" ADD CONSTRAINT "pendencia_anexo_pendenciaId_fkey"
  FOREIGN KEY ("pendenciaId") REFERENCES "pendencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pendencia_anexo" ADD CONSTRAINT "pendencia_anexo_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
