-- Gestão de Pessoas F4: onboarding vira ciclo de entrada ou de saída, com dono e prazo por item.
-- Aditiva: nenhuma coluna ou tabela sai; os processos existentes viram ciclos de entrada.

-- CreateEnum
CREATE TYPE "TipoCicloRh" AS ENUM ('entrada', 'saida');
CREATE TYPE "StatusCicloRh" AS ENUM ('em_andamento', 'concluido', 'cancelado');
CREATE TYPE "ResponsavelCicloRh" AS ENUM ('rh', 'ti', 'lider', 'coordenador', 'pessoa');
CREATE TYPE "PublicoCicloRh" AS ENUM ('clt_estagio', 'pj', 'todos');

-- Uma pessoa pode ter vários ciclos (recontratação): sai o único por usuário.
DROP INDEX "onboarding_processo_userId_key";

-- AlterTable
ALTER TABLE "onboarding_template" ADD COLUMN "tipo" "TipoCicloRh" NOT NULL DEFAULT 'entrada',
ADD COLUMN "publico" "PublicoCicloRh" NOT NULL DEFAULT 'todos';

ALTER TABLE "onboarding_template_item" ADD COLUMN "responsavel" "ResponsavelCicloRh" NOT NULL DEFAULT 'rh',
ADD COLUMN "prazoDias" INTEGER,
ADD COLUMN "patrimonio" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "onboarding_processo" ADD COLUMN "tipo" "TipoCicloRh" NOT NULL DEFAULT 'entrada',
ADD COLUMN "status" "StatusCicloRh" NOT NULL DEFAULT 'em_andamento',
ADD COLUMN "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "concluidoEm" TIMESTAMP(3),
ADD COLUMN "ancora" DATE,
ADD COLUMN "vinculoId" TEXT;

ALTER TABLE "onboarding_item" ADD COLUMN "responsavel" "ResponsavelCicloRh" NOT NULL DEFAULT 'rh',
ADD COLUMN "prazoEm" DATE,
ADD COLUMN "patrimonio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "concluidoPorId" TEXT,
ADD COLUMN "evidencia" TEXT,
ADD COLUMN "lembradoEm" DATE;

-- Backfill: o processo antigo começou quando foi criado; está concluído quando tem itens e
-- todos estão marcados (concluidoEm = o último item marcado).
UPDATE "onboarding_processo" SET "iniciadoEm" = "createdAt";
UPDATE "onboarding_processo" p
SET "status" = 'concluido',
    "concluidoEm" = (SELECT MAX(i."concluidoEm") FROM "onboarding_item" i WHERE i."processoId" = p."id")
WHERE EXISTS (SELECT 1 FROM "onboarding_item" i WHERE i."processoId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "onboarding_item" i WHERE i."processoId" = p."id" AND i."concluido" = false);

-- CreateIndex
CREATE INDEX "onboarding_processo_userId_tipo_status_idx" ON "onboarding_processo"("userId", "tipo", "status");
CREATE INDEX "onboarding_item_concluido_prazoEm_idx" ON "onboarding_item"("concluido", "prazoEm");

-- No máximo um ciclo EM ANDAMENTO por pessoa e tipo (índice parcial: fora do schema.prisma).
CREATE UNIQUE INDEX "onboarding_processo_um_aberto" ON "onboarding_processo"("userId", "tipo")
WHERE "status" = 'em_andamento';
