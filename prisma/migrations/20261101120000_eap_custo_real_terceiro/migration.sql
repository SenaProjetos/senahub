-- Lote 7 (2026-11-01): valor digitado do custo real de uma tarefa de terceiro (recurso "Externo").
-- Coluna nova, sempre nula: sem backfill.
ALTER TABLE "eap_tarefa" ADD COLUMN "custoRealTerceiro" DECIMAL(12,2);
