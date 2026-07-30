-- DropForeignKey
ALTER TABLE "custo_fornecedor_representante" DROP CONSTRAINT "custo_fornecedor_representante_fornecedorId_fkey";

-- DropForeignKey
ALTER TABLE "custo_preco_historico" DROP CONSTRAINT "custo_preco_historico_fornecedorId_fkey";

-- DropForeignKey
ALTER TABLE "custo_proposta" DROP CONSTRAINT "custo_proposta_fornecedorId_fkey";

-- DropForeignKey
ALTER TABLE "custo_rfq_convite" DROP CONSTRAINT "custo_rfq_convite_fornecedorId_fkey";

-- AlterTable
ALTER TABLE "fornecedor" DROP COLUMN "avaliacaoNota",
DROP COLUMN "categoriasFornecidas",
DROP COLUMN "condicoesComerciais",
DROP COLUMN "prazoMedioDiasEntrega",
DROP COLUMN "regioesAtendidas";

-- CreateTable
CREATE TABLE "custo_fornecedor" (
    "id" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'PJ',
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "regioesAtendidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoriasFornecidas" "CategoriaInsumo"[] DEFAULT ARRAY[]::"CategoriaInsumo"[],
    "prazoMedioDiasEntrega" INTEGER,
    "condicoesComerciais" TEXT,
    "avaliacaoNota" DECIMAL(3,2),

    CONSTRAINT "custo_fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custo_fornecedor_ativo_idx" ON "custo_fornecedor"("ativo");

-- AddForeignKey
ALTER TABLE "custo_fornecedor_representante" ADD CONSTRAINT "custo_fornecedor_representante_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "custo_fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_rfq_convite" ADD CONSTRAINT "custo_rfq_convite_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "custo_fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_proposta" ADD CONSTRAINT "custo_proposta_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "custo_fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_preco_historico" ADD CONSTRAINT "custo_preco_historico_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "custo_fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

