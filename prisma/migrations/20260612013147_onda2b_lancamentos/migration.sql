-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "StatusLancamento" AS ENUM ('previsto', 'confirmado', 'cancelado');

-- CreateTable
CREATE TABLE "lancamento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "valorEfetivo" DECIMAL(14,2),
    "status" "StatusLancamento" NOT NULL DEFAULT 'previsto',
    "data" DATE NOT NULL,
    "vencimento" DATE,
    "dataConfirmacao" DATE,
    "categoriaId" TEXT NOT NULL,
    "centroId" TEXT,
    "contaId" TEXT,
    "formaId" TEXT,
    "projetoId" TEXT,
    "fornecedorId" TEXT,
    "clienteId" TEXT,
    "observacao" TEXT,
    "recorrenciaGrupo" TEXT,
    "pagamentoProjetistaId" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lancamento_pagamentoProjetistaId_key" ON "lancamento"("pagamentoProjetistaId");

-- CreateIndex
CREATE INDEX "lancamento_tipo_status_idx" ON "lancamento"("tipo", "status");

-- CreateIndex
CREATE INDEX "lancamento_vencimento_idx" ON "lancamento"("vencimento");

-- CreateIndex
CREATE INDEX "lancamento_data_idx" ON "lancamento"("data");

-- CreateIndex
CREATE INDEX "lancamento_projetoId_idx" ON "lancamento"("projetoId");

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria_financeira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "conta_bancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_formaId_fkey" FOREIGN KEY ("formaId") REFERENCES "forma_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
