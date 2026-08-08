-- Item 13: referência cruzada entre apontamentos ("este problema é o mesmo daquele da ARQ-04").
-- Tabela nova, nasce vazia. Aponta pendência → pendência: como a pendência já está ancorada no
-- Documento (item 1), a referência sobrevive às revisões dos DOIS lados.

CREATE TABLE "referencia_pendencia" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "nota" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referencia_pendencia_pkey" PRIMARY KEY ("id")
);

-- Impede referência duplicada no mesmo sentido.
CREATE UNIQUE INDEX "referencia_pendencia_origemId_destinoId_key" ON "referencia_pendencia"("origemId", "destinoId");
CREATE INDEX "referencia_pendencia_destinoId_idx" ON "referencia_pendencia"("destinoId");
CREATE INDEX "referencia_pendencia_autorId_idx" ON "referencia_pendencia"("autorId");

ALTER TABLE "referencia_pendencia" ADD CONSTRAINT "referencia_pendencia_origemId_fkey"
  FOREIGN KEY ("origemId") REFERENCES "pendencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referencia_pendencia" ADD CONSTRAINT "referencia_pendencia_destinoId_fkey"
  FOREIGN KEY ("destinoId") REFERENCES "pendencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referencia_pendencia" ADD CONSTRAINT "referencia_pendencia_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
