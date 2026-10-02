-- N5 (núcleo do Financeiro): saldo de cada conta no fim do mês, congelado ao fechar.
ALTER TABLE "fechamento_mensal" ADD COLUMN IF NOT EXISTS "saldosContas" JSONB;
