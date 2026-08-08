-- Dependentes em lista (sub-etapa 2.5): CPF + flag de dedução de IRRF.
--
-- `dependenteIrrf` entra com DEFAULT false para linha NOVA (RH confirma ativamente), mas as
-- linhas que JÁ EXISTIAM são migradas para true logo abaixo — preserva o número que
-- `dependentesPorUsuario` (folha) já usa hoje, que conta TODOS os dependentes sem filtro.
--
-- `atualizadoEm` precisa de DEFAULT explícito (Prisma não emite um para @updatedAt): sem isso
-- o ADD COLUMN NOT NULL falha numa tabela populada.

-- AlterTable
ALTER TABLE "dependente"
  ADD COLUMN "cpf" TEXT,
  ADD COLUMN "dependenteIrrf" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: preserva o comportamento atual da folha (contava todo mundo).
UPDATE "dependente" SET "dependenteIrrf" = true;

-- O schema (`@updatedAt`) gerencia o valor na camada de aplicação, não via DEFAULT do banco —
-- o DEFAULT acima só existiu para o ADD COLUMN NOT NULL não falhar com a tabela populada.
-- Mesmo padrão de `20260623114345_ferramentas_calculo/migration.sql`.
ALTER TABLE "dependente" ALTER COLUMN "atualizadoEm" DROP DEFAULT;
