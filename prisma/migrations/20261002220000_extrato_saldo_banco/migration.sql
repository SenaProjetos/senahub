-- M0 (Financeiro): saldo informado pelo banco no OFX, para o Extrato por conta conferir com o do sistema.
ALTER TABLE "extrato_bancario" ADD COLUMN IF NOT EXISTS "saldoBanco" DECIMAL(14,2);
ALTER TABLE "extrato_bancario" ADD COLUMN IF NOT EXISTS "saldoBancoEm" DATE;
