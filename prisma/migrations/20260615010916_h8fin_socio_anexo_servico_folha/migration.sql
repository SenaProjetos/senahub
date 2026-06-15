-- CreateEnum
CREATE TYPE "TipoRetiradaSocio" AS ENUM ('pro_labore', 'distribuicao', 'adiantamento');

-- CreateEnum
CREATE TYPE "StatusFolhaProjetista" AS ENUM ('aberta', 'fechada', 'paga');

-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "pagamento_projetista" ADD COLUMN     "folhaId" TEXT;

-- CreateTable
CREATE TABLE "fornecedor_servico" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorReferencia" DECIMAL(14,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fornecedor_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retirada_socio" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "tipo" "TipoRetiradaSocio" NOT NULL DEFAULT 'pro_labore',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retirada_socio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folha_projetista" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "status" "StatusFolhaProjetista" NOT NULL DEFAULT 'aberta',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fechadaEm" TIMESTAMP(3),
    "pagaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folha_projetista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento_anexo" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamento_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento_status_historico" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT NOT NULL,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamento_status_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fornecedor_servico_fornecedorId_idx" ON "fornecedor_servico"("fornecedorId");

-- CreateIndex
CREATE INDEX "retirada_socio_socioId_idx" ON "retirada_socio"("socioId");

-- CreateIndex
CREATE UNIQUE INDEX "folha_projetista_ano_mes_key" ON "folha_projetista"("ano", "mes");

-- CreateIndex
CREATE INDEX "lancamento_anexo_lancamentoId_idx" ON "lancamento_anexo"("lancamentoId");

-- CreateIndex
CREATE INDEX "lancamento_status_historico_lancamentoId_idx" ON "lancamento_status_historico"("lancamentoId");

-- CreateIndex
CREATE INDEX "pagamento_projetista_folhaId_idx" ON "pagamento_projetista"("folhaId");

-- AddForeignKey
ALTER TABLE "fornecedor_servico" ADD CONSTRAINT "fornecedor_servico_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirada_socio" ADD CONSTRAINT "retirada_socio_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento_projetista" ADD CONSTRAINT "pagamento_projetista_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "folha_projetista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_anexo" ADD CONSTRAINT "lancamento_anexo_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_status_historico" ADD CONSTRAINT "lancamento_status_historico_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
