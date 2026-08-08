-- Item 28: medição com escala calibrada. Dois modos (declarar 1:N ou calibrar por dois
-- pontos), ambos normalizados em `mmPorPonto`. Colunas e tabela nascem vazias, sem backfill.

-- Medição congelada na Pendencia (valor + fator + modo que o produziram)
ALTER TABLE "pendencia" ADD COLUMN "medidaMm" DOUBLE PRECISION;
ALTER TABLE "pendencia" ADD COLUMN "medidaFator" DOUBLE PRECISION;
ALTER TABLE "pendencia" ADD COLUMN "medidaModo" TEXT;

-- Calibração por página, ancorada no documento (fallback no upload p/ linha legada sem pai)
CREATE TABLE "calibracao_prancha" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT,
    "uploadId" TEXT,
    "pagina" INTEGER NOT NULL,
    "modo" TEXT NOT NULL,
    "escalaDenominador" INTEGER,
    "mmPorPonto" DOUBLE PRECISION NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calibracao_prancha_pkey" PRIMARY KEY ("id")
);

-- Duas chaves únicas de propósito: exatamente um dos dois donos é preenchido, e no Postgres
-- NULL não colide — só a chave por documentoId deixaria as linhas legadas (documentoId nulo)
-- duplicarem calibração da mesma página.
CREATE UNIQUE INDEX "calibracao_prancha_documentoId_pagina_key" ON "calibracao_prancha"("documentoId", "pagina");
CREATE UNIQUE INDEX "calibracao_prancha_uploadId_pagina_key" ON "calibracao_prancha"("uploadId", "pagina");
CREATE INDEX "calibracao_prancha_autorId_idx" ON "calibracao_prancha"("autorId");

ALTER TABLE "calibracao_prancha" ADD CONSTRAINT "calibracao_prancha_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calibracao_prancha" ADD CONSTRAINT "calibracao_prancha_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calibracao_prancha" ADD CONSTRAINT "calibracao_prancha_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
