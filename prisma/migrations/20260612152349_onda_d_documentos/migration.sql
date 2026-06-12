-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('relatorio', 'proposta', 'contrato', 'recibo', 'holerite', 'outro');

-- CreateTable
CREATE TABLE "documento_modelo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoDocumento" NOT NULL DEFAULT 'relatorio',
    "fonte" TEXT,
    "schemaJson" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documento_modelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_modelo_versao" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "schemaJson" JSONB NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_modelo_versao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_modelo_tipo_ativo_idx" ON "documento_modelo"("tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "documento_modelo_versao_modeloId_numero_key" ON "documento_modelo_versao"("modeloId", "numero");

-- AddForeignKey
ALTER TABLE "documento_modelo_versao" ADD CONSTRAINT "documento_modelo_versao_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "documento_modelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_modelo_versao" ADD CONSTRAINT "documento_modelo_versao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
