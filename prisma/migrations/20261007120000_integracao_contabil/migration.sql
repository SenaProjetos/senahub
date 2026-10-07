-- CreateEnum
CREATE TYPE "AlvoDeParaContabil" AS ENUM ('categoria', 'categoria_contrapartida', 'conta_bancaria', 'cartao', 'cliente', 'fornecedor', 'padrao', 'imposto_recolher', 'imposto_compensar', 'centro', 'projeto');

-- CreateTable
CREATE TABLE "conta_contabil" (
    "id" TEXT NOT NULL,
    "reduzido" INTEGER NOT NULL,
    "classificacao" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "analitica" BOOLEAN NOT NULL,
    "natureza" TEXT NOT NULL,
    "aceitaCentroCusto" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conta_contabil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "de_para_contabil" (
    "id" TEXT NOT NULL,
    "alvo" "AlvoDeParaContabil" NOT NULL,
    "alvoId" TEXT NOT NULL,
    "contaReduzido" INTEGER,
    "codigoCentro" TEXT,
    "naoExportar" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "de_para_contabil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exportacao_contabil" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "linhas" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "totalCentavos" BIGINT NOT NULL,
    "pendencias" INTEGER NOT NULL,
    "geradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exportacao_contabil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conta_contabil_reduzido_key" ON "conta_contabil"("reduzido");

-- CreateIndex
CREATE UNIQUE INDEX "de_para_contabil_alvo_alvoId_key" ON "de_para_contabil"("alvo", "alvoId");

-- CreateIndex
CREATE INDEX "exportacao_contabil_competencia_idx" ON "exportacao_contabil"("competencia");


-- Sugestões do de-para (spec §11) com os reduzidos do plano do contador (GAMA CONTABIL, 2026-10).
-- Só categorias do SISTEMA, achadas pela chave (estável); categoria que não existe no banco não gera linha.
-- O dono confere tudo na tela; nada aqui é definitivo.
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt")
SELECT gen_random_uuid()::text, 'categoria', c."id", s.reduzido, false, CURRENT_TIMESTAMP
FROM (VALUES
  ('receita_projetos_particulares', 3108),
  ('receita_licitacoes', 3108),
  ('receita_outras', 3108),
  ('receita_juros_multas_recebidos', 3262),
  ('receita_descontos_obtidos', 3269),
  ('receita_rendimento_aplicacao', 3955),
  ('despesa_projetistas_pj', 2954),
  ('despesa_freelancers', 2954),
  ('despesa_administrativas', 3451),
  ('despesa_impostos', 3577),
  ('despesa_pro_labore', 2793),
  ('despesa_estagiarios', 4081),
  ('despesa_art_rrt', 2884),
  ('despesa_juros_multas_pagos', 2982),
  ('despesa_descontos_concedidos', 3003),
  ('distribuicao_lucros', 3374)
) AS s(chave, reduzido)
JOIN "categoria_financeira" c ON c."chave" = s.chave
ON CONFLICT ("alvo", "alvoId") DO NOTHING;

-- Contrapartida própria: o passivo que o título abre não é "fornecedor".
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt")
SELECT gen_random_uuid()::text, 'categoria_contrapartida', c."id", s.reduzido, false, CURRENT_TIMESTAMP
FROM (VALUES
  ('despesa_impostos', 3486),
  ('despesa_pro_labore', 2233),
  ('distribuicao_lucros', 3423)
) AS s(chave, reduzido)
JOIN "categoria_financeira" c ON c."chave" = s.chave
ON CONFLICT ("alvo", "alvoId") DO NOTHING;

-- Folha CLT: o contador processa a folha e lança ele mesmo (resposta de 2026-10-07).
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt")
SELECT gen_random_uuid()::text, 'categoria', c."id", NULL, true, CURRENT_TIMESTAMP
FROM "categoria_financeira" c WHERE c."chave" = 'despesa_folha_clt'
ON CONFLICT ("alvo", "alvoId") DO NOTHING;

-- Clientes Diversos / Fornecedores Diversos.
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt") VALUES
  (gen_random_uuid()::text, 'padrao', 'clientes', 1659, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'padrao', 'fornecedores', 2142, false, CURRENT_TIMESTAMP)
ON CONFLICT ("alvo", "alvoId") DO NOTHING;
