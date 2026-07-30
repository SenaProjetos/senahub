-- CreateEnum
CREATE TYPE "CustoStatusRfq" AS ENUM ('rascunho', 'aberta', 'encerrada', 'cancelada');

-- CreateEnum
CREATE TYPE "CustoStatusConvite" AS ENUM ('convidado', 'respondido', 'sem_resposta');

-- CreateEnum
CREATE TYPE "CustoStatusProposta" AS ENUM ('recebida', 'vencedora', 'nao_escolhida');

-- AlterTable
ALTER TABLE "fornecedor" ADD COLUMN     "avaliacaoNota" DECIMAL(3,2),
ADD COLUMN     "categoriasFornecidas" "CategoriaInsumo"[] DEFAULT ARRAY[]::"CategoriaInsumo"[],
ADD COLUMN     "condicoesComerciais" TEXT,
ADD COLUMN     "prazoMedioDiasEntrega" INTEGER,
ADD COLUMN     "regioesAtendidas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "custo_fornecedor_representante" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_fornecedor_representante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_rfq" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "CustoStatusRfq" NOT NULL DEFAULT 'rascunho',
    "prazoResposta" DATE,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_rfq_item" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "insumoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL,
    "unidade" TEXT NOT NULL,

    CONSTRAINT "custo_rfq_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_rfq_convite" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "status" "CustoStatusConvite" NOT NULL DEFAULT 'convidado',
    "convidadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "custo_rfq_convite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_proposta" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "status" "CustoStatusProposta" NOT NULL DEFAULT 'recebida',
    "frete" DECIMAL(14,2),
    "impostosInclusos" BOOLEAN NOT NULL DEFAULT true,
    "impostosValor" DECIMAL(14,2),
    "prazoEntregaDias" INTEGER,
    "validadeAte" DATE,
    "condicoesPagamento" TEXT,
    "observacoes" TEXT,
    "justificativaEscolha" TEXT,
    "escolhidoPorId" TEXT,
    "escolhidoEm" TIMESTAMP(3),
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_proposta_item" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "precoUnitario" DECIMAL(14,2) NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "custo_proposta_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_proposta_anexo" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_proposta_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_preco_historico" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT,
    "descricao" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "propostaId" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "unidade" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_preco_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custo_fornecedor_representante_fornecedorId_idx" ON "custo_fornecedor_representante"("fornecedorId");

-- CreateIndex
CREATE INDEX "custo_rfq_orcamentoId_idx" ON "custo_rfq"("orcamentoId");

-- CreateIndex
CREATE INDEX "custo_rfq_status_idx" ON "custo_rfq"("status");

-- CreateIndex
CREATE INDEX "custo_rfq_item_rfqId_idx" ON "custo_rfq_item"("rfqId");

-- CreateIndex
CREATE INDEX "custo_rfq_item_insumoId_idx" ON "custo_rfq_item"("insumoId");

-- CreateIndex
CREATE INDEX "custo_rfq_convite_rfqId_idx" ON "custo_rfq_convite"("rfqId");

-- CreateIndex
CREATE INDEX "custo_rfq_convite_fornecedorId_idx" ON "custo_rfq_convite"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "custo_rfq_convite_rfqId_fornecedorId_key" ON "custo_rfq_convite"("rfqId", "fornecedorId");

-- CreateIndex
CREATE INDEX "custo_proposta_rfqId_idx" ON "custo_proposta"("rfqId");

-- CreateIndex
CREATE INDEX "custo_proposta_fornecedorId_idx" ON "custo_proposta"("fornecedorId");

-- CreateIndex
CREATE INDEX "custo_proposta_item_propostaId_idx" ON "custo_proposta_item"("propostaId");

-- CreateIndex
CREATE INDEX "custo_proposta_item_rfqItemId_idx" ON "custo_proposta_item"("rfqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "custo_proposta_item_propostaId_rfqItemId_key" ON "custo_proposta_item"("propostaId", "rfqItemId");

-- CreateIndex
CREATE INDEX "custo_proposta_anexo_propostaId_idx" ON "custo_proposta_anexo"("propostaId");

-- CreateIndex
CREATE INDEX "custo_preco_historico_insumoId_idx" ON "custo_preco_historico"("insumoId");

-- CreateIndex
CREATE INDEX "custo_preco_historico_fornecedorId_idx" ON "custo_preco_historico"("fornecedorId");

-- AddForeignKey
ALTER TABLE "custo_fornecedor_representante" ADD CONSTRAINT "custo_fornecedor_representante_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq" ADD CONSTRAINT "custo_rfq_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "custo_orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq" ADD CONSTRAINT "custo_rfq_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq_item" ADD CONSTRAINT "custo_rfq_item_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "custo_rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq_item" ADD CONSTRAINT "custo_rfq_item_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "custo_insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq_convite" ADD CONSTRAINT "custo_rfq_convite_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "custo_rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq_convite" ADD CONSTRAINT "custo_rfq_convite_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta" ADD CONSTRAINT "custo_proposta_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "custo_rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta" ADD CONSTRAINT "custo_proposta_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta" ADD CONSTRAINT "custo_proposta_escolhidoPorId_fkey" FOREIGN KEY ("escolhidoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta" ADD CONSTRAINT "custo_proposta_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta_item" ADD CONSTRAINT "custo_proposta_item_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "custo_proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta_item" ADD CONSTRAINT "custo_proposta_item_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "custo_rfq_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta_anexo" ADD CONSTRAINT "custo_proposta_anexo_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "custo_proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta_anexo" ADD CONSTRAINT "custo_proposta_anexo_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_preco_historico" ADD CONSTRAINT "custo_preco_historico_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "custo_insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_preco_historico" ADD CONSTRAINT "custo_preco_historico_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_preco_historico" ADD CONSTRAINT "custo_preco_historico_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "custo_proposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

