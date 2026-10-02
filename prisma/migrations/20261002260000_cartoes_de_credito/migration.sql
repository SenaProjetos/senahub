-- M3 (Financeiro): cartões de crédito e cartão pessoal do sócio.
-- A compra é despesa no dia da compra; o caixa só sai quando a fatura é paga.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoCartao') THEN
    CREATE TYPE "TipoCartao" AS ENUM ('empresa', 'pessoal');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "cartao_credito" (
  "id"             TEXT NOT NULL,
  "nome"           TEXT NOT NULL,
  "ultimosDigitos" TEXT,
  "tipo"           "TipoCartao" NOT NULL DEFAULT 'empresa',
  "socioId"        TEXT,
  "limite"         DECIMAL(14,2),
  "diaFechamento"  INTEGER NOT NULL DEFAULT 25,
  "diaVencimento"  INTEGER NOT NULL DEFAULT 5,
  "contaPadraoId"  TEXT,
  "ativo"          BOOLEAN NOT NULL DEFAULT true,
  "ordem"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cartao_credito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fatura_cartao" (
  "id"          TEXT NOT NULL,
  "cartaoId"    TEXT NOT NULL,
  "competencia" TEXT NOT NULL,
  "inicioCiclo" DATE NOT NULL,
  "fimCiclo"    DATE NOT NULL,
  "vencimento"  DATE NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fatura_cartao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lancamento"
  ADD COLUMN IF NOT EXISTS "cartaoId" TEXT,
  ADD COLUMN IF NOT EXISTS "faturaId" TEXT;

CREATE INDEX IF NOT EXISTS "cartao_credito_ativo_idx" ON "cartao_credito"("ativo");
CREATE UNIQUE INDEX IF NOT EXISTS "fatura_cartao_cartaoId_competencia_key" ON "fatura_cartao"("cartaoId", "competencia");
CREATE INDEX IF NOT EXISTS "fatura_cartao_vencimento_idx" ON "fatura_cartao"("vencimento");
CREATE INDEX IF NOT EXISTS "lancamento_faturaId_idx" ON "lancamento"("faturaId");
CREATE INDEX IF NOT EXISTS "lancamento_cartaoId_idx" ON "lancamento"("cartaoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cartao_credito_socioId_fkey') THEN
    ALTER TABLE "cartao_credito" ADD CONSTRAINT "cartao_credito_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cartao_credito_contaPadraoId_fkey') THEN
    ALTER TABLE "cartao_credito" ADD CONSTRAINT "cartao_credito_contaPadraoId_fkey" FOREIGN KEY ("contaPadraoId") REFERENCES "conta_bancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fatura_cartao_cartaoId_fkey') THEN
    ALTER TABLE "fatura_cartao" ADD CONSTRAINT "fatura_cartao_cartaoId_fkey" FOREIGN KEY ("cartaoId") REFERENCES "cartao_credito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamento_cartaoId_fkey') THEN
    ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_cartaoId_fkey" FOREIGN KEY ("cartaoId") REFERENCES "cartao_credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamento_faturaId_fkey') THEN
    ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "fatura_cartao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
