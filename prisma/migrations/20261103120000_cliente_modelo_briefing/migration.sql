-- Lote 4b (2026-11-03): modelo de formulário do briefing padrão por cliente. Coluna opcional, sem backfill:
-- nulo = o cliente segue o modelo padrão do sistema, como sempre foi.
ALTER TABLE "cliente" ADD COLUMN "modeloBriefingId" TEXT;

CREATE INDEX "cliente_modeloBriefingId_idx" ON "cliente"("modeloBriefingId");

ALTER TABLE "cliente" ADD CONSTRAINT "cliente_modeloBriefingId_fkey" FOREIGN KEY ("modeloBriefingId") REFERENCES "modelo_briefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
