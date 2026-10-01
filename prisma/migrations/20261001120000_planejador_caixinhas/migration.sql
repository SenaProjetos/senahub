-- Planejador de caixa (F4): caixinhas. Aditiva: tabelas novas, um enum novo, uma coluna anulável em
-- lancamento (FK SET NULL) e as 9 caixinhas iniciais. Spec 2026-09-30 §4; plano I9, I12.
-- CreateEnum
CREATE TYPE "RegraNecessidade" AS ENUM ('meta_fixa', 'compromissos_ligados');

-- CreateEnum
CREATE TYPE "TipoMovimentoCaixinha" AS ENUM ('alocacao', 'liberacao', 'transferencia', 'ajuste');

-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "caixinhaId" TEXT;

-- CreateTable
CREATE TABLE "caixinha" (
    "id" TEXT NOT NULL,
    "chave" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "regra" "RegraNecessidade" NOT NULL DEFAULT 'compromissos_ligados',
    "meta" DECIMAL(14,2),
    "horizonteDias" INTEGER NOT NULL DEFAULT 30,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caixinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimento_caixinha" (
    "id" TEXT NOT NULL,
    "caixinhaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoCaixinha" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT,
    "transferenciaId" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimento_caixinha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caixinha_chave_key" ON "caixinha"("chave");

-- CreateIndex
CREATE INDEX "caixinha_ativo_ordem_idx" ON "caixinha"("ativo", "ordem");

-- CreateIndex
CREATE INDEX "movimento_caixinha_caixinhaId_data_idx" ON "movimento_caixinha"("caixinhaId", "data");

-- CreateIndex
CREATE INDEX "movimento_caixinha_transferenciaId_idx" ON "movimento_caixinha"("transferenciaId");

-- CreateIndex
CREATE INDEX "lancamento_caixinhaId_idx" ON "lancamento"("caixinhaId");

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_caixinha" ADD CONSTRAINT "movimento_caixinha_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_caixinha" ADD CONSTRAINT "movimento_caixinha_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Caixinhas iniciais (mock "Caixinhas"), achadas pela `chave`: rodar de novo não duplica e quem as
-- renomear/ajustar não é desfeito. Metas ficam em branco (sem meta) até o dono definir os valores.
INSERT INTO "caixinha" ("id", "chave", "nome", "regra", "horizonteDias", "ordem", "updatedAt") VALUES
  (gen_random_uuid()::text, 'salarios',             'Salários',               'compromissos_ligados', 30, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pro_labore',           'Pró-labore',             'compromissos_ligados', 30, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'impostos',             'Impostos',               'compromissos_ligados', 30, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'encargos',             'Encargos',               'compromissos_ligados', 45, 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ferias',               'Férias',                 'meta_fixa',            30, 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'decimo_terceiro',      '13º salário',            'meta_fixa',            30, 60, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'reserva_operacional',  'Reserva operacional',    'meta_fixa',            30, 70, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'reserva_emergencia',   'Reserva de emergência',  'meta_fixa',            30, 80, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'distribuicao_lucros',  'Distribuição de lucros', 'meta_fixa',            30, 90, CURRENT_TIMESTAMP)
ON CONFLICT ("chave") DO NOTHING;
