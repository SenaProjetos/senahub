-- Catálogo de cargos e departamentos (sub-etapa 2.1 do "cadastro do colaborador").
--
-- Só schema, puramente aditivo: `user.cargo` e `user.departamento` (texto livre) continuam
-- existindo e passam a ser CACHE do rótulo das novas FKs.
--
-- O backfill (texto livre -> linhas de catálogo -> FK) NÃO está aqui de propósito: ele reusa
-- o canonizador de `src/modules/rh/catalogos/canonizar.ts`, o mesmo que o dry-run usa, para
-- que o relatório aprovado descreva exatamente o que roda. Depois desta migration, execute:
--   tsx --tsconfig tsconfig.server.json scripts/backfill-cargos.ts --gravar
-- O script é idempotente: pula quem já tem cargoId/departamentoId.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "cargoId" TEXT,
ADD COLUMN     "departamentoId" TEXT;

-- CreateTable
CREATE TABLE "cargo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "setor" "Setor",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cargo_nome_key" ON "cargo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "departamento_nome_key" ON "departamento"("nome");

-- CreateIndex
CREATE INDEX "departamento_setor_idx" ON "departamento"("setor");

-- CreateIndex
CREATE INDEX "user_cargoId_idx" ON "user"("cargoId");

-- CreateIndex
CREATE INDEX "user_departamentoId_idx" ON "user"("departamentoId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
