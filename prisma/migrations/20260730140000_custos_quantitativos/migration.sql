-- CreateEnum
CREATE TYPE "CustoOrigemDado" AS ENUM ('manual', 'ifc', 'dwg', 'pdf', 'ia');

-- CreateEnum
CREATE TYPE "CustoGrandeza" AS ENUM ('area', 'volume', 'comprimento', 'contagem', 'peso');

-- CreateTable
CREATE TABLE "custo_quantitativo" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "itemId" TEXT,
    "descricao" TEXT NOT NULL,
    "grandeza" "CustoGrandeza" NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL,
    "origem" "CustoOrigemDado" NOT NULL,
    "confianca" DECIMAL(3,2),
    "uploadId" TEXT,
    "guids" JSONB,
    "pagina" INTEGER,
    "ancoraJson" JSONB,
    "memoria" TEXT,
    "substituidoPorId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custo_quantitativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custo_vinculo_bim" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "ifcGuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custo_vinculo_bim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custo_quantitativo_substituidoPorId_key" ON "custo_quantitativo"("substituidoPorId");

-- CreateIndex
CREATE INDEX "custo_quantitativo_orcamentoId_idx" ON "custo_quantitativo"("orcamentoId");

-- CreateIndex
CREATE INDEX "custo_quantitativo_itemId_idx" ON "custo_quantitativo"("itemId");

-- CreateIndex
CREATE INDEX "custo_quantitativo_uploadId_idx" ON "custo_quantitativo"("uploadId");

-- CreateIndex
CREATE INDEX "custo_quantitativo_criadoPorId_idx" ON "custo_quantitativo"("criadoPorId");

-- CreateIndex
CREATE INDEX "custo_vinculo_bim_itemId_idx" ON "custo_vinculo_bim"("itemId");

-- CreateIndex
CREATE INDEX "custo_vinculo_bim_uploadId_idx" ON "custo_vinculo_bim"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "custo_vinculo_bim_itemId_ifcGuid_key" ON "custo_vinculo_bim"("itemId", "ifcGuid");

-- AddForeignKey
ALTER TABLE "custo_quantitativo" ADD CONSTRAINT "custo_quantitativo_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "custo_orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_quantitativo" ADD CONSTRAINT "custo_quantitativo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "custo_orcamento_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_quantitativo" ADD CONSTRAINT "custo_quantitativo_substituidoPorId_fkey" FOREIGN KEY ("substituidoPorId") REFERENCES "custo_quantitativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_quantitativo" ADD CONSTRAINT "custo_quantitativo_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custo_vinculo_bim" ADD CONSTRAINT "custo_vinculo_bim_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "custo_orcamento_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
