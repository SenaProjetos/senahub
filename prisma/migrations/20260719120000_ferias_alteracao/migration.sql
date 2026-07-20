-- Proposta de alteração de datas em férias já aprovadas (dupla aprovação admin + funcionário)
ALTER TABLE "ferias"
  ADD COLUMN "altInicio" DATE,
  ADD COLUMN "altFim" DATE,
  ADD COLUMN "altPorId" TEXT,
  ADD COLUMN "altOkAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "altOkFunc" BOOLEAN NOT NULL DEFAULT false;
