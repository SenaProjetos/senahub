-- Lançamento de férias pelo RH/admin, sem solicitação do colaborador.
-- Não-nulo ⟺ lançado pelo RH; guarda a autoria. Denormalizado, sem FK (mesmo padrão de "altPorId").
-- Nullable e sem default: seguro em tabela populada, não exige backfill.
ALTER TABLE "ferias" ADD COLUMN "lancadoPorId" TEXT;
