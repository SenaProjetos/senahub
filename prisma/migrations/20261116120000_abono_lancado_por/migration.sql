-- Lançamento de abono/atestado pelo RH, sem solicitação do colaborador (nasce aprovado).
-- Não-nulo ⟺ lançado pelo RH; guarda a autoria. Denormalizado, sem FK (mesmo padrão de "ferias"."lancadoPorId").
-- Nullable e sem default: seguro em tabela populada, não exige backfill.
ALTER TABLE "abono_falta" ADD COLUMN "lancadoPorId" TEXT;
