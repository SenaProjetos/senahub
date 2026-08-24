-- M9: rastreia a revisão lógica de origem e de resolução de cada pendência.
-- Ambas são opcionais para preservar linhas legadas; o backfill em script preenche apenas a origem.
ALTER TABLE "pendencia"
  ADD COLUMN "revisaoOrigemId" TEXT,
  ADD COLUMN "revisaoResolucaoId" TEXT;

CREATE INDEX "pendencia_revisaoOrigemId_idx" ON "pendencia"("revisaoOrigemId");
CREATE INDEX "pendencia_revisaoResolucaoId_idx" ON "pendencia"("revisaoResolucaoId");

ALTER TABLE "pendencia"
  ADD CONSTRAINT "pendencia_revisaoOrigemId_fkey"
  FOREIGN KEY ("revisaoOrigemId") REFERENCES "documento_revisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pendencia"
  ADD CONSTRAINT "pendencia_revisaoResolucaoId_fkey"
  FOREIGN KEY ("revisaoResolucaoId") REFERENCES "documento_revisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
