-- Nomenclatura versionada + siglas por versão + sub-disciplinas (F1 da spec
-- docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md). Só acrescenta:
-- nenhuma coluna existente muda ou sai. Contração (codigo/sinonimos, config global) em deploy posterior.

-- CreateEnum
CREATE TYPE "SequenciaNomenclatura" AS ENUM ('faixa', 'card', 'sub');

-- CreateEnum
CREATE TYPE "CategoriaSigla" AS ENUM ('disciplina', 'subdisciplina', 'fase', 'tipo', 'folha');

-- AlterTable
ALTER TABLE "disciplina_catalogo" ADD COLUMN     "versaoAte" INTEGER,
ADD COLUMN     "versaoDesde" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "documento_disciplina" ADD COLUMN     "subdisciplinaId" TEXT;

-- AlterTable
ALTER TABLE "prancha_catalogo" ADD COLUMN     "versaoAte" INTEGER,
ADD COLUMN     "versaoDesde" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "projeto" ADD COLUMN     "nomenclaturaVersaoId" TEXT;

-- CreateTable
CREATE TABLE "nomenclatura_versao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "modelo" TEXT,
    "larguraNumero" INTEGER NOT NULL DEFAULT 3,
    "sequenciaPor" "SequenciaNomenclatura" NOT NULL DEFAULT 'sub',
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "publicadaEm" TIMESTAMP(3),
    "publicadaPorId" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nomenclatura_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdisciplina_catalogo" (
    "id" TEXT NOT NULL,
    "disciplinaCatalogoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "versaoDesde" INTEGER NOT NULL DEFAULT 1,
    "versaoAte" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subdisciplina_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sigla_nomenclatura" (
    "id" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "categoria" "CategoriaSigla" NOT NULL,
    "oficial" BOOLEAN NOT NULL DEFAULT false,
    "versaoDesde" INTEGER NOT NULL DEFAULT 1,
    "versaoAte" INTEGER,
    "disciplinaCatalogoId" TEXT,
    "subdisciplinaId" TEXT,
    "pranchaCatalogoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sigla_nomenclatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nomenclatura_versao_numero_key" ON "nomenclatura_versao"("numero");

-- CreateIndex
CREATE INDEX "nomenclatura_versao_publicadaPorId_idx" ON "nomenclatura_versao"("publicadaPorId");

-- CreateIndex
CREATE UNIQUE INDEX "subdisciplina_catalogo_disciplinaCatalogoId_nome_key" ON "subdisciplina_catalogo"("disciplinaCatalogoId", "nome");

-- CreateIndex
CREATE INDEX "sigla_nomenclatura_sigla_idx" ON "sigla_nomenclatura"("sigla");

-- CreateIndex
CREATE INDEX "sigla_nomenclatura_disciplinaCatalogoId_idx" ON "sigla_nomenclatura"("disciplinaCatalogoId");

-- CreateIndex
CREATE INDEX "sigla_nomenclatura_subdisciplinaId_idx" ON "sigla_nomenclatura"("subdisciplinaId");

-- CreateIndex
CREATE INDEX "sigla_nomenclatura_pranchaCatalogoId_idx" ON "sigla_nomenclatura"("pranchaCatalogoId");

-- CreateIndex
CREATE INDEX "documento_disciplina_subdisciplinaId_idx" ON "documento_disciplina"("subdisciplinaId");

-- CreateIndex
CREATE INDEX "projeto_nomenclaturaVersaoId_idx" ON "projeto"("nomenclaturaVersaoId");

-- AddForeignKey
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_nomenclaturaVersaoId_fkey" FOREIGN KEY ("nomenclaturaVersaoId") REFERENCES "nomenclatura_versao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomenclatura_versao" ADD CONSTRAINT "nomenclatura_versao_publicadaPorId_fkey" FOREIGN KEY ("publicadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subdisciplina_catalogo" ADD CONSTRAINT "subdisciplina_catalogo_disciplinaCatalogoId_fkey" FOREIGN KEY ("disciplinaCatalogoId") REFERENCES "disciplina_catalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sigla_nomenclatura" ADD CONSTRAINT "sigla_nomenclatura_disciplinaCatalogoId_fkey" FOREIGN KEY ("disciplinaCatalogoId") REFERENCES "disciplina_catalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sigla_nomenclatura" ADD CONSTRAINT "sigla_nomenclatura_subdisciplinaId_fkey" FOREIGN KEY ("subdisciplinaId") REFERENCES "subdisciplina_catalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sigla_nomenclatura" ADD CONSTRAINT "sigla_nomenclatura_pranchaCatalogoId_fkey" FOREIGN KEY ("pranchaCatalogoId") REFERENCES "prancha_catalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_subdisciplinaId_fkey" FOREIGN KEY ("subdisciplinaId") REFERENCES "subdisciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Invariantes que o Prisma não expressa ────────────────────────────────────────────────

-- Exatamente um alvo por sigla, e a categoria amarrada ao alvo: sigla de disciplina aponta
-- para disciplina, de sub para sub, e fase/tipo/folha para o catálogo da Lista Mestre. Que a
-- categoria da sigla bata com a categoria do item de `prancha_catalogo` fica com a action.
ALTER TABLE "sigla_nomenclatura" ADD CONSTRAINT "sigla_nomenclatura_um_alvo"
  CHECK (num_nonnulls("disciplinaCatalogoId", "subdisciplinaId", "pranchaCatalogoId") = 1);
ALTER TABLE "sigla_nomenclatura" ADD CONSTRAINT "sigla_nomenclatura_categoria_alvo"
  CHECK (
    ("categoria" = 'disciplina') = ("disciplinaCatalogoId" IS NOT NULL)
    AND ("categoria" = 'subdisciplina') = ("subdisciplinaId" IS NOT NULL)
    AND ("categoria" IN ('fase', 'tipo', 'folha')) = ("pranchaCatalogoId" IS NOT NULL)
  );

-- Faixa de versões bem formada (fim nulo = sem fim).
ALTER TABLE "sigla_nomenclatura" ADD CONSTRAINT "sigla_nomenclatura_faixa_versao"
  CHECK ("versaoDesde" >= 1 AND ("versaoAte" IS NULL OR "versaoAte" >= "versaoDesde"));
ALTER TABLE "disciplina_catalogo" ADD CONSTRAINT "disciplina_catalogo_faixa_versao"
  CHECK ("versaoDesde" >= 1 AND ("versaoAte" IS NULL OR "versaoAte" >= "versaoDesde"));
ALTER TABLE "prancha_catalogo" ADD CONSTRAINT "prancha_catalogo_faixa_versao"
  CHECK ("versaoDesde" >= 1 AND ("versaoAte" IS NULL OR "versaoAte" >= "versaoDesde"));
ALTER TABLE "subdisciplina_catalogo" ADD CONSTRAINT "subdisciplina_catalogo_faixa_versao"
  CHECK ("versaoDesde" >= 1 AND ("versaoAte" IS NULL OR "versaoAte" >= "versaoDesde"));

ALTER TABLE "nomenclatura_versao" ADD CONSTRAINT "nomenclatura_versao_numero_positivo"
  CHECK ("numero" >= 1);
ALTER TABLE "nomenclatura_versao" ADD CONSTRAINT "nomenclatura_versao_largura_numero"
  CHECK ("larguraNumero" BETWEEN 1 AND 6);

-- ── Transição (tudo aqui, sem script avulso — spec §5 F1) ────────────────────────────────

-- 1. A v1 é o padrão global de hoje, copiado como está (null/vazio = leitor embutido).
--    `vigenteDesde` antigo de propósito: qualquer projeto, pela data de criação, cai na v1
--    enquanto não houver outra versão publicada. Folha de 4 dígitos, numeração por faixa.
INSERT INTO "nomenclatura_versao"
  ("id", "numero", "nome", "modelo", "larguraNumero", "sequenciaPor", "vigenteDesde", "publicadaEm", "descricao", "updatedAt")
SELECT
  gen_random_uuid()::text,
  1,
  'Padrão original',
  (SELECT NULLIF(btrim(c."padrao"), '') FROM "nomenclatura_config" c WHERE c."projetoId" IS NULL LIMIT 1),
  4,
  'faixa',
  TIMESTAMP '2000-01-01 00:00:00',
  CURRENT_TIMESTAMP,
  'Padrão em uso antes do versionamento ({proj}-{disc}-{fase}-{nº}-{tipo}). Criada pela migration de 2026-09-22.',
  CURRENT_TIMESTAMP
ON CONFLICT ("numero") DO NOTHING;

-- 2. Todo projeto existente fica preso na v1 (D2/D12). Projeto com padrão próprio continua
--    personalizado: `NomenclaturaConfig.padrao` do projeto vence a versão na leitura.
--    `exigir`/`exigirFase` não são tocados — seguem herdando do global como hoje.
UPDATE "projeto"
SET "nomenclaturaVersaoId" = (SELECT v."id" FROM "nomenclatura_versao" v WHERE v."numero" = 1)
WHERE "nomenclaturaVersaoId" IS NULL;

-- 3. Siglas e sinônimos atuais viram linhas válidas da v1 em diante (expand). As colunas
--    antigas ficam; o espelho das telas é `sincronizarSiglasV1` até a F4.
INSERT INTO "sigla_nomenclatura" ("id", "sigla", "categoria", "oficial", "versaoDesde", "disciplinaCatalogoId")
SELECT gen_random_uuid()::text, upper(btrim(d."codigo")), 'disciplina', true, 1, d."id"
FROM "disciplina_catalogo" d
WHERE d."codigo" IS NOT NULL AND btrim(d."codigo") <> '';

INSERT INTO "sigla_nomenclatura" ("id", "sigla", "categoria", "oficial", "versaoDesde", "disciplinaCatalogoId")
SELECT gen_random_uuid()::text, s.sin, 'disciplina', false, 1, s.id
FROM (
  SELECT DISTINCT d."id", upper(btrim(x)) AS sin, upper(btrim(coalesce(d."codigo", ''))) AS oficial
  FROM "disciplina_catalogo" d, unnest(d."sinonimos") AS x
) s
WHERE s.sin <> '' AND s.sin <> s.oficial;

-- O cast `categoria::text::"CategoriaSigla"` depende de os rótulos de `CategoriaPranchaCatalogo`
-- (folha|tipo|fase) existirem com a mesma grafia em `CategoriaSigla` — verdade hoje; esta
-- migration roda uma vez só, então um rename futuro de enum não a afeta.
INSERT INTO "sigla_nomenclatura" ("id", "sigla", "categoria", "oficial", "versaoDesde", "pranchaCatalogoId")
SELECT gen_random_uuid()::text, upper(btrim(p."sigla")), p."categoria"::text::"CategoriaSigla", true, 1, p."id"
FROM "prancha_catalogo" p
WHERE btrim(p."sigla") <> '';

INSERT INTO "sigla_nomenclatura" ("id", "sigla", "categoria", "oficial", "versaoDesde", "pranchaCatalogoId")
SELECT gen_random_uuid()::text, s.sin, s.categoria::text::"CategoriaSigla", false, 1, s.id
FROM (
  SELECT DISTINCT p."id", p."categoria", upper(btrim(x)) AS sin, upper(btrim(p."sigla")) AS oficial
  FROM "prancha_catalogo" p, unnest(p."sinonimos") AS x
) s
WHERE s.sin <> '' AND s.sin <> s.oficial;
