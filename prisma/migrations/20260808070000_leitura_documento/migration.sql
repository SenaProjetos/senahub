-- Item 8: marca d'água de "até onde eu já analisei este documento". Tabela nova, nasce vazia
-- (sem backfill de propósito — ver a nota no schema: ausência = primeira visita, não "tudo novo").
CREATE TABLE "leitura_documento" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leitura_documento_pkey" PRIMARY KEY ("id")
);

-- Uma linha por (documento, pessoa) — o upsert da abertura depende desta chave.
CREATE UNIQUE INDEX "leitura_documento_documentoId_userId_key" ON "leitura_documento"("documentoId", "userId");
CREATE INDEX "leitura_documento_userId_idx" ON "leitura_documento"("userId");

ALTER TABLE "leitura_documento" ADD CONSTRAINT "leitura_documento_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leitura_documento" ADD CONSTRAINT "leitura_documento_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
