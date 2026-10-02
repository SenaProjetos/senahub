-- N0/A1 do núcleo do Financeiro: a folha CLT do mês M é paga até o 5º dia útil de M+1, e pode ter
-- adiantamento de salário no próprio mês. O compromisso recorrente passa a saber: vencer no N-ésimo dia
-- útil, vencer meses depois da competência e ser um adiantamento (que a folha não quita).
-- Aditiva: os compromissos existentes ficam como estavam (dia fixo, no próprio mês, não adiantamento).
DO $$ BEGIN
  CREATE TYPE "RegraVencimentoRecorrencia" AS ENUM ('dia_fixo', 'dia_util');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "compromisso_recorrente"
  ADD COLUMN IF NOT EXISTS "regraVencimento" "RegraVencimentoRecorrencia" NOT NULL DEFAULT 'dia_fixo',
  ADD COLUMN IF NOT EXISTS "mesesAteVencimento" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adiantamento" BOOLEAN NOT NULL DEFAULT false;
