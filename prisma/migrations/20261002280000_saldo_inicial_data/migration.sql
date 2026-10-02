-- M8 (Financeiro): data do saldo inicial da conta. Nula = comportamento antigo (tudo o que foi realizado
-- na conta entra no saldo); preenchida = só o realizado a partir desse dia, o resto já está no saldo inicial.
ALTER TABLE "conta_bancaria" ADD COLUMN IF NOT EXISTS "saldoInicialEm" DATE;
