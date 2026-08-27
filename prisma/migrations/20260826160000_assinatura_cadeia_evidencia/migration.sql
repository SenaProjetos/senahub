-- Gerenciador de contratos (spec `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`),
-- Fase D — trilha de evidência de assinatura encadeada por hash.
--
-- Aditiva pura: uma tabela nova + duas colunas nullable em `aceite_documento`. Nenhum aceite
-- existente muda de comportamento; os antigos ficam com `ip`/`userAgent` nulos porque de fato
-- ninguém registrou esses dados na época — inventar valor seria falsear prova.
--
-- A unique `(versaoId, sequencia)` é a peça que impede a cadeia de BIFURCAR: dois appends
-- concorrentes calculam a mesma próxima sequência, um grava e o outro leva P2002 (a aplicação
-- refaz a transação). Sem ela nasceriam dois ramos que verificam íntegros isoladamente, sem
-- nenhum ser a história real.
--
-- `ON DELETE CASCADE` a partir da versão, igual a `aceite_documento`: a trilha só existe enquanto
-- existir o documento que ela testemunha. A tabela é APPEND-ONLY por convenção da aplicação —
-- nada no código faz UPDATE ou DELETE de evento.

-- CreateEnum
CREATE TYPE "TipoEventoAssinatura" AS ENUM ('visualizado', 'autenticado', 'assinado');

-- AlterTable
ALTER TABLE "aceite_documento" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "evento_assinatura" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "tipo" "TipoEventoAssinatura" NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator" TEXT NOT NULL,
    "atorNome" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "hashArquivo" TEXT,
    "hashAnterior" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "evento_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_assinatura_versaoId_sequencia_idx" ON "evento_assinatura"("versaoId", "sequencia");

-- CreateIndex
CREATE UNIQUE INDEX "evento_assinatura_versaoId_sequencia_key" ON "evento_assinatura"("versaoId", "sequencia");

-- AddForeignKey
ALTER TABLE "evento_assinatura" ADD CONSTRAINT "evento_assinatura_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "doc_juridico_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
