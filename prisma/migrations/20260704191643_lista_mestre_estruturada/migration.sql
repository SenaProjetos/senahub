-- Reestruturação da Lista Mestre.
-- Backfill SEGURO: preserva as linhas existentes de "prancha" (não falha em tabela não-vazia,
-- não perde os registros). Colunas novas entram NULLABLE, são preenchidas, e só então recebem
-- NOT NULL. As siglas folha/tipo/fase não são deriváveis com segurança do código antigo →
-- placeholder '?' (o gestor renomeia na Lista Mestre). O "titulo" antigo vira "conteudo";
-- a revisão textual (ex.: 'R02') é convertida para inteiro preservando o número.

-- CreateEnum
CREATE TYPE "CategoriaPranchaCatalogo" AS ENUM ('folha', 'tipo', 'fase');

-- 1) Novas colunas como NULLABLE (evita "column contains null values" em tabela não-vazia).
ALTER TABLE "prancha"
  ADD COLUMN "conteudo"  TEXT,
  ADD COLUMN "fase"      TEXT,
  ADD COLUMN "folha"     TEXT,
  ADD COLUMN "numeracao" INTEGER,
  ADD COLUMN "tipo"      TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- 2) Backfill a partir do esquema antigo.
UPDATE "prancha" SET
  "conteudo"  = "titulo",
  "fase"      = '?',
  "folha"     = '?',
  "tipo"      = '?',
  "numeracao" = 0,
  "updatedAt" = CURRENT_TIMESTAMP;

-- 3) Converte "revisao" textual → inteiro, preservando o número (dígitos do valor antigo).
ALTER TABLE "prancha" ADD COLUMN "revisao_int" INTEGER;
UPDATE "prancha" SET "revisao_int" =
  COALESCE(NULLIF(regexp_replace(COALESCE("revisao", ''), '\D', '', 'g'), '')::int, 0);
ALTER TABLE "prancha" DROP COLUMN "revisao";
ALTER TABLE "prancha" RENAME COLUMN "revisao_int" TO "revisao";

-- 4) Aplica NOT NULL/DEFAULT conforme o modelo (agora que tudo está preenchido).
ALTER TABLE "prancha"
  ALTER COLUMN "fase"      SET NOT NULL,
  ALTER COLUMN "folha"     SET NOT NULL,
  ALTER COLUMN "numeracao" SET NOT NULL,
  ALTER COLUMN "tipo"      SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "revisao"   SET NOT NULL,
  ALTER COLUMN "revisao"   SET DEFAULT 0;

-- 5) Remove as colunas antigas (dados relevantes já migrados para "conteudo").
ALTER TABLE "prancha"
  DROP COLUMN "codigo",
  DROP COLUMN "escala",
  DROP COLUMN "titulo";

-- CreateTable
CREATE TABLE "prancha_catalogo" (
    "id" TEXT NOT NULL,
    "categoria" "CategoriaPranchaCatalogo" NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "projetoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prancha_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prancha_catalogo_categoria_projetoId_idx" ON "prancha_catalogo"("categoria", "projetoId");

-- AddForeignKey
ALTER TABLE "prancha_catalogo" ADD CONSTRAINT "prancha_catalogo_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
