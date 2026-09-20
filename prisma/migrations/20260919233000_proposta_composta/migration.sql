-- Proposta composta (ADR-0006): modelo + biblioteca de cláusulas + plano de pagamento calculado.
--
-- Escrita à mão: o `migrate diff` precisa de shadow database, que o usuário `senahub` do dev não
-- pode criar (sem CREATEDB). O efeito já foi aplicado no dev por `db push`; este arquivo é o
-- registro para os outros ambientes e é marcado com `migrate resolve --applied`.
--
-- TUDO É ADITIVO. Nenhuma coluna existente muda de tipo, nada é removido: a coluna `externa`
-- CONTINUA e segue sendo a verdade. Esta é a etapa "expandir" da troca de `externa` por
-- `formato` (expandir → migrar → contrair); o passo que troca as leituras vem depois, e o
-- `DROP COLUMN "externa"` só numa migração posterior ao deploy daquele.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "FormatoProposta" AS ENUM ('legado', 'externa', 'composta');

CREATE TYPE "SecaoProposta" AS ENUM ('descricao', 'escopo', 'valor_observacao', 'pagamento_observacao', 'nao_incluso', 'competencia_contratada', 'competencia_contratante', 'documentos', 'alteracoes');

-- ── Modelo de proposta (mantido pela gestão) ─────────────────────────────────
CREATE TABLE "modelo_proposta" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "familia" TEXT,
    "descricao" TEXT,
    "secoesJson" JSONB NOT NULL,
    "pagamentoJson" JSONB,
    "validadeDias" INTEGER NOT NULL DEFAULT 30,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_proposta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modelo_proposta_slug_key" ON "modelo_proposta"("slug");

CREATE INDEX "modelo_proposta_ativo_idx" ON "modelo_proposta"("ativo");

-- ── Biblioteca de cláusulas ──────────────────────────────────────────────────
CREATE TABLE "clausula_proposta" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "secao" "SecaoProposta" NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "disciplinaId" TEXT,
    "uf" CHAR(2),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clausula_proposta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clausula_proposta_slug_key" ON "clausula_proposta"("slug");

CREATE INDEX "clausula_proposta_secao_ativo_idx" ON "clausula_proposta"("secao", "ativo");

CREATE INDEX "clausula_proposta_disciplinaId_idx" ON "clausula_proposta"("disciplinaId");

-- ── Texto da proposta: cópia da cláusula, editável por proposta ──────────────
CREATE TABLE "proposta_secao" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "secao" "SecaoProposta" NOT NULL,
    "titulo" TEXT,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "disciplinaId" TEXT,
    "clausulaId" TEXT,

    CONSTRAINT "proposta_secao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposta_secao_propostaId_idx" ON "proposta_secao"("propostaId");

CREATE INDEX "proposta_secao_clausulaId_idx" ON "proposta_secao"("clausulaId");

CREATE INDEX "proposta_secao_disciplinaId_idx" ON "proposta_secao"("disciplinaId");

-- ── Plano de pagamento: percentual, nunca o valor ────────────────────────────
CREATE TABLE "proposta_parcela" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "prazo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposta_parcela_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposta_parcela_propostaId_idx" ON "proposta_parcela"("propostaId");

-- ── Colunas novas na proposta ────────────────────────────────────────────────
-- `formato` entra com DEFAULT, então a tabela populada não quebra; o backfill logo abaixo é que
-- dá o valor certo às externas já existentes.
ALTER TABLE "proposta" ADD COLUMN "formato" "FormatoProposta" NOT NULL DEFAULT 'legado';
ALTER TABLE "proposta" ADD COLUMN "modelo_proposta_id" TEXT;
ALTER TABLE "proposta" ADD COLUMN "obraEndereco" TEXT;
ALTER TABLE "proposta" ADD COLUMN "obraCidade" TEXT;
ALTER TABLE "proposta" ADD COLUMN "obraUF" CHAR(2);

CREATE INDEX "proposta_formato_idx" ON "proposta"("formato");

CREATE INDEX "proposta_modelo_proposta_id_idx" ON "proposta"("modelo_proposta_id");

-- ── Chaves estrangeiras ──────────────────────────────────────────────────────
-- SetNull nas de catálogo/origem: aposentar um modelo, uma disciplina ou uma cláusula NÃO pode
-- apagar proposta nem o texto já enviado ao cliente. Cascade só do lado da própria proposta.
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_modelo_proposta_id_fkey" FOREIGN KEY ("modelo_proposta_id") REFERENCES "modelo_proposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clausula_proposta" ADD CONSTRAINT "clausula_proposta_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_secao" ADD CONSTRAINT "proposta_secao_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_secao" ADD CONSTRAINT "proposta_secao_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_secao" ADD CONSTRAINT "proposta_secao_clausulaId_fkey" FOREIGN KEY ("clausulaId") REFERENCES "clausula_proposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_parcela" ADD CONSTRAINT "proposta_parcela_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill de `formato` a partir de `externa` ──────────────────────────────
-- O `migrate` não gera isto sozinho. Sem esta linha, as propostas externas de produção (34 na
-- análise de 2026-09-19) ficariam marcadas como `legado`, e no passo 2 — quando as rotas
-- públicas passarem a filtrar por `formato` — a página pública de uma proposta externa voltaria
-- a abrir, que é exatamente o que o ADR-0005 proíbe.
UPDATE "proposta" SET "formato" = 'externa' WHERE "externa" = true;

-- ── Permissão nova: comercial:modelos ────────────────────────────────────────
-- `seedPerfisAcesso` é create-only desde 2026-09-02: par novo NÃO chega sozinho a perfil que já
-- existe, e sem esta concessão o par nasce negado para todo mundo, em silêncio.
--
-- Derivado de `configuracoes:gerir`, e NÃO de `comercial:gerir`: manter a biblioteca é da gestão
-- (ADR-0006), porque editar uma cláusula muda o texto de toda proposta futura — quem monta
-- proposta não deve herdar isso. Hoje os dois conjuntos coincidem (perfil `administrativo`), mas
-- derivar do par certo é o que mantém a distinção quando o dono ampliar `comercial:gerir`.
--
-- Idempotente pelo ON CONFLICT da unique (perfilId, recurso, acao): reexecutar não duplica nem
-- desfaz uma revogação deliberada.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, pp."perfilId", 'comercial', 'modelos', true
FROM "permissao_perfil" pp
WHERE pp."recurso" = 'configuracoes' AND pp."acao" = 'gerir' AND pp."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
