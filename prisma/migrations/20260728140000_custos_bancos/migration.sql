-- Engenharia de Custos, Onda C1 — banco de insumos, composições (com auxiliar recursivo) e
-- bases de preço + rastreio de import assíncrono (SINAPI).
-- Plano: docs/superpowers/plans/2026-07-28-custos-c1-bancos.md
--
-- Puramente aditiva: 2 enums + 5 tabelas novas. `custo_base_preco.uf`/`regime` usam sentinela
-- ("NACIONAL"/"padrao") em vez de nulo — nulo não força unicidade no Postgres (NULL ≠ NULL) e
-- composição não tem UF (só o preço tem).

-- CreateEnum
CREATE TYPE "CategoriaInsumo" AS ENUM ('servicos', 'material', 'mao_de_obra', 'encargos_complementares', 'equipamento', 'especiais');

-- CreateEnum
CREATE TYPE "TipoItemComposicao" AS ENUM ('insumo', 'composicao');

-- CreateTable
CREATE TABLE "custo_base_preco" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "uf" TEXT NOT NULL DEFAULT 'NACIONAL',
    "regime" TEXT NOT NULL DEFAULT 'padrao',
    "dataBase" DATE NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_base_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_composicao" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "grupo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_composicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_composicao_item" (
    "id" TEXT NOT NULL,
    "composicaoId" TEXT NOT NULL,
    "tipo" "TipoItemComposicao" NOT NULL,
    "insumoId" TEXT,
    "composicaoAuxId" TEXT,
    "coeficiente" DECIMAL(12,6) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_composicao_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_importacao" (
    "id" TEXT NOT NULL,
    "fonte" TEXT NOT NULL DEFAULT 'sinapi',
    "dataBase" DATE NOT NULL,
    "ufs" TEXT[],
    "regimes" TEXT[],
    "caminhoArquivo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "progresso" INTEGER,
    "insumosCriados" INTEGER NOT NULL DEFAULT 0,
    "precosCriados" INTEGER NOT NULL DEFAULT 0,
    "composicoesCriadas" INTEGER NOT NULL DEFAULT 0,
    "itensCriados" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "autorId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_insumo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "categoria" "CategoriaInsumo" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_preco" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_preco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custo_base_preco_fonte_uf_idx" ON "custo_base_preco"("fonte", "uf");

-- CreateIndex
CREATE UNIQUE INDEX "custo_base_preco_fonte_uf_regime_dataBase_key" ON "custo_base_preco"("fonte", "uf", "regime", "dataBase");

-- CreateIndex
CREATE UNIQUE INDEX "custo_composicao_baseId_codigo_key" ON "custo_composicao"("baseId", "codigo");

-- CreateIndex
CREATE INDEX "custo_composicao_baseId_idx" ON "custo_composicao"("baseId");

-- CreateIndex
CREATE INDEX "custo_composicao_item_composicaoAuxId_idx" ON "custo_composicao_item"("composicaoAuxId");

-- CreateIndex
CREATE INDEX "custo_composicao_item_composicaoId_idx" ON "custo_composicao_item"("composicaoId");

-- CreateIndex
CREATE INDEX "custo_composicao_item_insumoId_idx" ON "custo_composicao_item"("insumoId");

-- CreateIndex
CREATE INDEX "custo_importacao_status_idx" ON "custo_importacao"("status");

-- CreateIndex
CREATE UNIQUE INDEX "custo_insumo_fonte_codigo_key" ON "custo_insumo"("fonte", "codigo");

-- CreateIndex
CREATE INDEX "custo_insumo_fonte_idx" ON "custo_insumo"("fonte");

-- CreateIndex
CREATE UNIQUE INDEX "custo_preco_baseId_insumoId_key" ON "custo_preco"("baseId", "insumoId");

-- CreateIndex
CREATE INDEX "custo_preco_insumoId_idx" ON "custo_preco"("insumoId");

-- AddForeignKey
ALTER TABLE "custo_composicao" ADD CONSTRAINT "custo_composicao_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "custo_base_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_composicao_item" ADD CONSTRAINT "custo_composicao_item_composicaoAuxId_fkey" FOREIGN KEY ("composicaoAuxId") REFERENCES "custo_composicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_composicao_item" ADD CONSTRAINT "custo_composicao_item_composicaoId_fkey" FOREIGN KEY ("composicaoId") REFERENCES "custo_composicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_composicao_item" ADD CONSTRAINT "custo_composicao_item_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "custo_insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_importacao" ADD CONSTRAINT "custo_importacao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_preco" ADD CONSTRAINT "custo_preco_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "custo_base_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_preco" ADD CONSTRAINT "custo_preco_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "custo_insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
