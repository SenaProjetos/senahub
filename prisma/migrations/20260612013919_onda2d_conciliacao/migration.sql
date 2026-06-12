-- CreateTable
CREATE TABLE "extrato_bancario" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "nomeArquivo" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extrato_bancario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacao_bancaria" (
    "id" TEXT NOT NULL,
    "extratoId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "fitid" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "lancamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacao_bancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regra_categorizacao" (
    "id" TEXT NOT NULL,
    "termo" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regra_categorizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extrato_bancario_contaId_idx" ON "extrato_bancario"("contaId");

-- CreateIndex
CREATE UNIQUE INDEX "transacao_bancaria_lancamentoId_key" ON "transacao_bancaria"("lancamentoId");

-- CreateIndex
CREATE INDEX "transacao_bancaria_contaId_conciliado_idx" ON "transacao_bancaria"("contaId", "conciliado");

-- CreateIndex
CREATE UNIQUE INDEX "transacao_bancaria_contaId_fitid_key" ON "transacao_bancaria"("contaId", "fitid");

-- AddForeignKey
ALTER TABLE "extrato_bancario" ADD CONSTRAINT "extrato_bancario_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "conta_bancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacao_bancaria" ADD CONSTRAINT "transacao_bancaria_extratoId_fkey" FOREIGN KEY ("extratoId") REFERENCES "extrato_bancario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacao_bancaria" ADD CONSTRAINT "transacao_bancaria_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "conta_bancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacao_bancaria" ADD CONSTRAINT "transacao_bancaria_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_categorizacao" ADD CONSTRAINT "regra_categorizacao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria_financeira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
