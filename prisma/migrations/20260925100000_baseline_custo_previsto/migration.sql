-- F7.1 — Custo previsto por linha, congelado na linha de base (VP do Valor Agregado, F8).
-- Aditiva: coluna NULL; baselines antigas ficam com custo desconhecido (nulo), nunca zero.

-- AlterTable
ALTER TABLE "eap_baseline_linha" ADD COLUMN     "custoPrevisto" DECIMAL(14,2);
