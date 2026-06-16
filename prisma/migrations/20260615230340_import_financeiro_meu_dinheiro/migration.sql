-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "importHash" TEXT,
ADD COLUMN     "importLoteId" TEXT;

-- CreateTable
CREATE TABLE "importacao_financeira" (
    "id" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'meu_dinheiro',
    "totalLinhas" INTEGER NOT NULL,
    "lancamentosCriados" INTEGER NOT NULL DEFAULT 0,
    "categoriasCriadas" INTEGER NOT NULL DEFAULT 0,
    "contasCriadas" INTEGER NOT NULL DEFAULT 0,
    "formasCriadas" INTEGER NOT NULL DEFAULT 0,
    "centrosCriados" INTEGER NOT NULL DEFAULT 0,
    "fornecedoresCriados" INTEGER NOT NULL DEFAULT 0,
    "clientesCriados" INTEGER NOT NULL DEFAULT 0,
    "mapeamento" JSONB NOT NULL,
    "autorId" TEXT NOT NULL,
    "desfeitoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_financeira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importacao_financeira_autorId_idx" ON "importacao_financeira"("autorId");

-- CreateIndex
CREATE INDEX "lancamento_importLoteId_idx" ON "lancamento"("importLoteId");

-- CreateIndex
CREATE INDEX "lancamento_importHash_idx" ON "lancamento"("importHash");

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_importLoteId_fkey" FOREIGN KEY ("importLoteId") REFERENCES "importacao_financeira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacao_financeira" ADD CONSTRAINT "importacao_financeira_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
