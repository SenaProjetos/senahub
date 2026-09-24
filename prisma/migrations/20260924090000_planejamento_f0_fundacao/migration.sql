-- F0 do motor de planejamento (spec docs/superpowers/specs/2026-09-23-planejamento-motor-cronograma.md).
--
-- ORDEM IMPORTA: acrescenta tudo → faz o backfill lendo `marco` → só então derruba `marco`.
-- Inverter isso perderia a informação de quais linhas são marco.
--
-- O único DROP é a coluna `marco`, e ele é o último passo, com IF EXISTS — banco que já
-- não a tenha (ou que rode esta migration duas vezes) não pode derrubar o deploy.

-- ─────────────────────────────────────────────────────────────
-- 1. Tipos
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "TipoEap" AS ENUM ('prj', 'fas', 'pct', 'disc', 'loc', 'sis', 'res', 'atv', 'mrc');

-- CreateEnum
CREATE TYPE "StatusEap" AS ENUM ('nin', 'and', 'agu', 'blq', 'rev', 'apr', 'con', 'sus', 'can', 'arq');

-- CreateEnum
CREATE TYPE "PrioridadeEap" AS ENUM ('bai', 'med', 'alt', 'crt');

-- CreateEnum
CREATE TYPE "TipoVinculoEap" AS ENUM ('fs', 'ss', 'ff', 'sf');

-- CreateEnum
CREATE TYPE "RestricaoEap" AS ENUM ('iniciar_em', 'iniciar_nao_antes_de', 'iniciar_nao_depois_de', 'terminar_em', 'terminar_nao_antes_de', 'terminar_nao_depois_de');

-- CreateEnum
CREATE TYPE "CategoriaEapCatalogo" AS ENUM ('tipo_atividade', 'sistema', 'localizacao', 'origem');

-- ─────────────────────────────────────────────────────────────
-- 2. Colunas novas
-- ─────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "eap_tarefa" ADD COLUMN     "idCorporativo" TEXT,
ADD COLUMN     "codigoEap" TEXT,
ADD COLUMN     "tipoEap" "TipoEap" NOT NULL DEFAULT 'atv',
ADD COLUMN     "duracaoDias" DECIMAL(6,2) NOT NULL DEFAULT 1,
ADD COLUMN     "etapaId" TEXT,
ADD COLUMN     "tipoAtividadeId" TEXT,
ADD COLUMN     "sistemaId" TEXT,
ADD COLUMN     "localizacaoId" TEXT,
ADD COLUMN     "origemId" TEXT,
ADD COLUMN     "status" "StatusEap" NOT NULL DEFAULT 'nin',
ADD COLUMN     "prioridade" "PrioridadeEap" NOT NULL DEFAULT 'med',
ADD COLUMN     "inicioReal" DATE,
ADD COLUMN     "fimReal" DATE,
ADD COLUMN     "restricaoTipo" "RestricaoEap",
ADD COLUMN     "restricaoData" DATE;

-- AlterTable
ALTER TABLE "eap_dependencia" ADD COLUMN     "tipo" "TipoVinculoEap" NOT NULL DEFAULT 'fs',
ADD COLUMN     "lagDias" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- 3. Tabelas novas
-- ─────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "eap_catalogo" (
    "id" TEXT NOT NULL,
    "categoria" "CategoriaEapCatalogo" NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "projetoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eap_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eap_sequencia" (
    "prefixo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "eap_sequencia_pkey" PRIMARY KEY ("prefixo")
);

-- CreateTable
CREATE TABLE "cronograma_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "aprovado" BOOLEAN NOT NULL DEFAULT false,
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPorId" TEXT,
    "dataStatus" DATE,
    "calendarioChave" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cronograma_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eap_baseline" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "motivo" TEXT,
    "observacao" TEXT,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eap_baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eap_baseline_linha" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "tarefaId" TEXT,
    "nome" TEXT NOT NULL,
    "codigoEap" TEXT,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "duracaoDias" DECIMAL(6,2) NOT NULL,
    "trabalhoHoras" DECIMAL(8,2),
    "avancoPlanejado" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "eap_baseline_linha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eap_codigo_historico" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "codigoAnterior" TEXT,
    "codigoNovo" TEXT,
    "motivo" TEXT,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eap_codigo_historico_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- 4. Índices e chaves
-- ─────────────────────────────────────────────────────────────

-- CreateIndex
CREATE UNIQUE INDEX "eap_tarefa_idCorporativo_key" ON "eap_tarefa"("idCorporativo");
CREATE INDEX "eap_tarefa_projetoId_tipoEap_idx" ON "eap_tarefa"("projetoId", "tipoEap");
CREATE INDEX "eap_tarefa_disciplinaId_etapaId_idx" ON "eap_tarefa"("disciplinaId", "etapaId");
CREATE INDEX "eap_tarefa_etapaId_idx" ON "eap_tarefa"("etapaId");
CREATE INDEX "eap_tarefa_tipoAtividadeId_idx" ON "eap_tarefa"("tipoAtividadeId");
CREATE INDEX "eap_tarefa_sistemaId_idx" ON "eap_tarefa"("sistemaId");
CREATE INDEX "eap_tarefa_localizacaoId_idx" ON "eap_tarefa"("localizacaoId");
CREATE INDEX "eap_tarefa_origemId_idx" ON "eap_tarefa"("origemId");

-- CreateIndex
CREATE UNIQUE INDEX "eap_catalogo_categoria_sigla_projetoId_key" ON "eap_catalogo"("categoria", "sigla", "projetoId");
CREATE INDEX "eap_catalogo_categoria_projetoId_idx" ON "eap_catalogo"("categoria", "projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "cronograma_projeto_projetoId_key" ON "cronograma_projeto"("projetoId");
CREATE INDEX "cronograma_projeto_aprovadoPorId_idx" ON "cronograma_projeto"("aprovadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "eap_baseline_projetoId_numero_key" ON "eap_baseline"("projetoId", "numero");
CREATE INDEX "eap_baseline_autorId_idx" ON "eap_baseline"("autorId");

-- CreateIndex
CREATE INDEX "eap_baseline_linha_baselineId_idx" ON "eap_baseline_linha"("baselineId");
CREATE INDEX "eap_baseline_linha_tarefaId_idx" ON "eap_baseline_linha"("tarefaId");

-- CreateIndex
CREATE INDEX "eap_codigo_historico_tarefaId_idx" ON "eap_codigo_historico"("tarefaId");
CREATE INDEX "eap_codigo_historico_autorId_idx" ON "eap_codigo_historico"("autorId");

-- AddForeignKey
ALTER TABLE "eap_catalogo" ADD CONSTRAINT "eap_catalogo_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "prancha_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_tipoAtividadeId_fkey" FOREIGN KEY ("tipoAtividadeId") REFERENCES "eap_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_sistemaId_fkey" FOREIGN KEY ("sistemaId") REFERENCES "eap_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "eap_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "eap_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cronograma_projeto" ADD CONSTRAINT "cronograma_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cronograma_projeto" ADD CONSTRAINT "cronograma_projeto_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_baseline" ADD CONSTRAINT "eap_baseline_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eap_baseline" ADD CONSTRAINT "eap_baseline_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_baseline_linha" ADD CONSTRAINT "eap_baseline_linha_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "eap_baseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eap_baseline_linha" ADD CONSTRAINT "eap_baseline_linha_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "eap_tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_codigo_historico" ADD CONSTRAINT "eap_codigo_historico_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eap_codigo_historico" ADD CONSTRAINT "eap_codigo_historico_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 5. Backfill — LÊ `marco`, por isso vem antes do DROP
-- ─────────────────────────────────────────────────────────────

-- Marco: natureza vira `mrc` e duração é 0 por definição (Doc 03 §11).
UPDATE "eap_tarefa" SET "tipoEap" = 'mrc', "duracaoDias" = 0 WHERE "marco" = true;

-- Demais linhas: duração em dias de calendário inclusivos — a MESMA conta que o CPM antigo
-- fazia a partir das datas. Não é o calendário de trabalho: a F1 traz dias úteis + feriados
-- e recalcula tudo. Aqui só preserva a intenção que já estava nas datas.
UPDATE "eap_tarefa"
   SET "duracaoDias" = GREATEST(("fimPrevisto" - "inicioPrevisto") + 1, 1)
 WHERE "marco" = false;

-- Linha-resumo (tem filha) é `res`; o resto continua `atv`. Marco já foi classificado acima.
UPDATE "eap_tarefa" p
   SET "tipoEap" = 'res'
 WHERE p."tipoEap" = 'atv'
   AND EXISTS (SELECT 1 FROM "eap_tarefa" f WHERE f."parentId" = p."id");

-- Linha ligada a disciplina e sem filha vira `disc` — é o que `gerarEapDasDisciplinas` cria.
UPDATE "eap_tarefa" p
   SET "tipoEap" = 'disc'
 WHERE p."tipoEap" = 'atv'
   AND p."disciplinaId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "eap_tarefa" f WHERE f."parentId" = p."id");

-- ID corporativo de toda linha existente. O número segue a ordem de criação para o
-- resultado ser estável e reproduzível; o prefixo vem do TEAP já atribuído acima.
WITH numerada AS (
  SELECT "id",
         upper("tipoEap"::text) AS prefixo,
         row_number() OVER (PARTITION BY "tipoEap" ORDER BY "createdAt", "id") AS n
    FROM "eap_tarefa"
   WHERE "idCorporativo" IS NULL
)
UPDATE "eap_tarefa" t
   SET "idCorporativo" = numerada.prefixo || '-' || lpad(numerada.n::text, 5, '0')
  FROM numerada
 WHERE t."id" = numerada."id";

-- Semente do contador, no ponto onde o backfill parou. Sem isso a primeira linha criada
-- pela aplicação colidiria com o `idCorporativo` de uma linha existente.
INSERT INTO "eap_sequencia" ("prefixo", "ultimo")
SELECT upper("tipoEap"::text), COUNT(*)
  FROM "eap_tarefa"
 GROUP BY "tipoEap"
    ON CONFLICT ("prefixo") DO NOTHING;

-- Todo projeto que já tem EAP ganha cronograma em RASCUNHO (D27). Nunca aprovado:
-- aprovar automaticamente congelaria como "combinado com o cliente" datas que ninguém revisou,
-- e todo relatório de desvio nasceria mentindo.
INSERT INTO "cronograma_projeto" ("id", "projetoId", "aprovado", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "projeto" p
 WHERE EXISTS (SELECT 1 FROM "eap_tarefa" t WHERE t."projetoId" = p."id")
    ON CONFLICT ("projetoId") DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 6. Contração — só agora, com o backfill já feito
-- ─────────────────────────────────────────────────────────────

-- DropColumn
ALTER TABLE "eap_tarefa" DROP COLUMN IF EXISTS "marco";
