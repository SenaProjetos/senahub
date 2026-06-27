/*
  Warnings:

  - You are about to drop the column `arquivo_path` on the `documento_gerado` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "OrigemUpload" AS ENUM ('manual', 'ferramenta');

-- DropForeignKey
ALTER TABLE "checklist_item_projeto" DROP CONSTRAINT "checklist_item_projeto_projetoId_fkey";

-- DropForeignKey
ALTER TABLE "risco_projeto" DROP CONSTRAINT "risco_projeto_projetoId_fkey";

-- DropIndex
DROP INDEX "idx_cliente_nome_trgm";

-- DropIndex
DROP INDEX "idx_projeto_codigo";

-- DropIndex
DROP INDEX "idx_projeto_nome_trgm";

-- AlterTable
ALTER TABLE "checklist_item_projeto" ALTER COLUMN "concluidoEm" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "documento_gerado" DROP COLUMN "arquivo_path",
ADD COLUMN     "arquivoPath" TEXT;

-- AlterTable
ALTER TABLE "risco_projeto" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "upload" ADD COLUMN     "origem" "OrigemUpload" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "calculo_ferramenta" (
    "id" TEXT NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "norma" TEXT,
    "versaoCalc" INTEGER NOT NULL DEFAULT 1,
    "entradasJson" JSONB NOT NULL,
    "resultadoJson" JSONB NOT NULL,
    "autorId" TEXT NOT NULL,
    "projetoId" TEXT,
    "disciplinaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculo_ferramenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calculo_ferramenta_autorId_ferramenta_createdAt_idx" ON "calculo_ferramenta"("autorId", "ferramenta", "createdAt");

-- CreateIndex
CREATE INDEX "calculo_ferramenta_projetoId_idx" ON "calculo_ferramenta"("projetoId");

-- AddForeignKey
ALTER TABLE "checklist_item_projeto" ADD CONSTRAINT "checklist_item_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risco_projeto" ADD CONSTRAINT "risco_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculo_ferramenta" ADD CONSTRAINT "calculo_ferramenta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculo_ferramenta" ADD CONSTRAINT "calculo_ferramenta_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculo_ferramenta" ADD CONSTRAINT "calculo_ferramenta_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;
