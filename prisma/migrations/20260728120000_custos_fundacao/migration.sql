-- Engenharia de Custos, Onda C0 — fundação.
-- Plano: docs/superpowers/plans/2026-07-27-custos-c0-fundacao.md
-- Design:  docs/superpowers/specs/2026-07-27-engenharia-custos-design.md
--
-- Puramente aditiva: 4 enums + 3 tabelas novas. `projetoId`/`nomeAvulso` em custo_orcamento
-- são ambos opcionais (D1: orçamento pode ser avulso). `licitacaoId` é ponte financeira
-- RESERVADA (D4) — sem uso funcional nesta onda. Sem coluna de empresa (D6).

-- CreateEnum
CREATE TYPE "CustoRegimeEncargos" AS ENUM ('desonerado', 'nao_desonerado');

-- CreateEnum
CREATE TYPE "CustoRegimeTributario" AS ENUM ('lucro_presumido', 'lucro_real', 'simples_nacional');

-- CreateEnum
CREATE TYPE "CustoTipoItem" AS ENUM ('grupo', 'servico');

-- CreateEnum
CREATE TYPE "StatusCustoOrcamento" AS ENUM ('rascunho', 'em_elaboracao', 'concluido', 'aprovado', 'cancelado');

-- CreateTable
CREATE TABLE "custo_orcamento" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusCustoOrcamento" NOT NULL DEFAULT 'rascunho',
    "projetoId" TEXT,
    "nomeAvulso" TEXT,
    "contratanteId" TEXT,
    "contratanteNome" TEXT,
    "dataBase" DATE NOT NULL,
    "bdiAdmCentral" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiSeguro" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiRisco" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiGarantia" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiDespesasFinanceiras" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiLucro" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiPis" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiCofins" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiIss" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiCprb" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bdiPercentual" DECIMAL(5,2),
    "regimeEncargos" "CustoRegimeEncargos" NOT NULL DEFAULT 'nao_desonerado',
    "encargosPreset" TEXT NOT NULL DEFAULT 'sinapi',
    "encargosOverridesJson" JSONB,
    "encargosHoristaPct" DECIMAL(5,2),
    "encargosMensalistaPct" DECIMAL(5,2),
    "regimeTributario" "CustoRegimeTributario" NOT NULL,
    "licitacaoId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_orcamento_item" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "parentId" TEXT,
    "tipo" "CustoTipoItem" NOT NULL,
    "codigo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "quantidade" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "custoUnitario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bdiPercentual" DECIMAL(5,2),
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "totalSemBdi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalComBdi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_orcamento_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_orcamento_revisao" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "valorTotalComBdi" DECIMAL(14,2) NOT NULL,
    "dataBase" DATE NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_orcamento_revisao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custo_orcamento_contratanteId_idx" ON "custo_orcamento"("contratanteId");

-- CreateIndex
CREATE INDEX "custo_orcamento_criadoPorId_idx" ON "custo_orcamento"("criadoPorId");

-- CreateIndex
CREATE INDEX "custo_orcamento_licitacaoId_idx" ON "custo_orcamento"("licitacaoId");

-- CreateIndex
CREATE INDEX "custo_orcamento_projetoId_idx" ON "custo_orcamento"("projetoId");

-- CreateIndex
CREATE INDEX "custo_orcamento_status_idx" ON "custo_orcamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "custo_orcamento_item_orcamentoId_codigo_key" ON "custo_orcamento_item"("orcamentoId", "codigo");

-- CreateIndex
CREATE INDEX "custo_orcamento_item_orcamentoId_idx" ON "custo_orcamento_item"("orcamentoId");

-- CreateIndex
CREATE INDEX "custo_orcamento_item_parentId_idx" ON "custo_orcamento_item"("parentId");

-- CreateIndex
CREATE INDEX "custo_orcamento_revisao_orcamentoId_idx" ON "custo_orcamento_revisao"("orcamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "custo_orcamento_revisao_orcamentoId_numero_key" ON "custo_orcamento_revisao"("orcamentoId", "numero");

-- AddForeignKey
ALTER TABLE "custo_orcamento" ADD CONSTRAINT "custo_orcamento_contratanteId_fkey" FOREIGN KEY ("contratanteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento" ADD CONSTRAINT "custo_orcamento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento" ADD CONSTRAINT "custo_orcamento_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento" ADD CONSTRAINT "custo_orcamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento_item" ADD CONSTRAINT "custo_orcamento_item_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "custo_orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento_item" ADD CONSTRAINT "custo_orcamento_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "custo_orcamento_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento_revisao" ADD CONSTRAINT "custo_orcamento_revisao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_orcamento_revisao" ADD CONSTRAINT "custo_orcamento_revisao_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "custo_orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
