-- Fase 0 da separacao Setor x Contratacao x Perfil de acesso.
-- Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md
--
-- ESTRUTURAL APENAS. Puramente aditiva: enums novos, tabela nova e colunas nullable.
-- Nenhuma coluna NOT NULL sem default sobre tabela populada; nenhum DROP; nenhum RENAME.
-- Nada aqui altera comportamento: autorizacao continua 100% em `user.role`.
--
-- O BACKFILL NAO ESTA AQUI. Ele vive em scripts/backfill-vinculos.ts (idempotente, gera
-- CSV de conferencia) porque o mapa tem regra de negocio -- data de inicio, PJ, socio --
-- que fica auditavel em TS e nao em SQL cru. Ate ele rodar, `user.tipo`, `user.setor` e
-- `user.contratacao` ficam NULL, que e a leitura honesta de "ainda nao migrado".

-- CreateEnum
CREATE TYPE "Setor" AS ENUM ('diretoria', 'administrativo', 'juridico', 'engenharia', 'ti');

-- CreateEnum
CREATE TYPE "Contratacao" AS ENUM ('clt', 'estagio', 'pj', 'autonomo_rpa', 'pro_labore');

-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('interno', 'externo');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "contratacao" "Contratacao",
ADD COLUMN     "setor" "Setor",
ADD COLUMN     "tipo" "TipoUsuario",
ADD COLUMN     "vinculoAtivoId" TEXT;

-- CreateTable
CREATE TABLE "vinculo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contratacao" "Contratacao" NOT NULL,
    "setor" "Setor" NOT NULL,
    "cargo" TEXT,
    "cargaSemanal" DECIMAL(4,1),
    "remuneracao" DECIMAL(12,2),
    "pjId" TEXT,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE,
    "motivoFim" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vinculo_userId_dataInicio_idx" ON "vinculo"("userId", "dataInicio");

-- CreateIndex
CREATE INDEX "vinculo_userId_ativo_idx" ON "vinculo"("userId", "ativo");

-- CreateIndex
CREATE INDEX "vinculo_pjId_idx" ON "vinculo"("pjId");

-- CreateIndex
CREATE UNIQUE INDEX "user_vinculoAtivoId_key" ON "user"("vinculoAtivoId");

-- CreateIndex
CREATE INDEX "user_tipo_setor_idx" ON "user"("tipo", "setor");

-- CreateIndex
CREATE INDEX "user_contratacao_idx" ON "user"("contratacao");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_vinculoAtivoId_fkey" FOREIGN KEY ("vinculoAtivoId") REFERENCES "vinculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo" ADD CONSTRAINT "vinculo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo" ADD CONSTRAINT "vinculo_pjId_fkey" FOREIGN KEY ("pjId") REFERENCES "pessoa_juridica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

