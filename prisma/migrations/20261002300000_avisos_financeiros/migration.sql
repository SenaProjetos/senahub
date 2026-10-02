-- M9 (Financeiro): registro dos avisos já enviados, para o mesmo aviso nunca sair duas vezes.
CREATE TABLE IF NOT EXISTS "aviso_financeiro_enviado" (
  "id"           TEXT NOT NULL,
  "lancamentoId" TEXT NOT NULL,
  "tipo"         TEXT NOT NULL,
  "destino"      TEXT NOT NULL,
  "vencimento"   DATE NOT NULL,
  "enviadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "aviso_financeiro_enviado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "aviso_financeiro_enviado_lancamentoId_tipo_destino_vencimen_key"
  ON "aviso_financeiro_enviado"("lancamentoId", "tipo", "destino", "vencimento");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aviso_financeiro_enviado_lancamentoId_fkey') THEN
    ALTER TABLE "aviso_financeiro_enviado" ADD CONSTRAINT "aviso_financeiro_enviado_lancamentoId_fkey"
      FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
