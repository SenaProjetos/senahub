-- AlterTable
ALTER TABLE "documento_juridico" ADD COLUMN     "pastaId" TEXT;

-- CreateTable
CREATE TABLE "pasta_juridica" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parentId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasta_juridica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "descricao" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arquivo_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_projeto_versao" (
    "id" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "caminho" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivo_projeto_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funcionario_documento" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'outro',
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funcionario_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pasta_juridica_parentId_idx" ON "pasta_juridica"("parentId");

-- CreateIndex
CREATE INDEX "arquivo_projeto_projetoId_idx" ON "arquivo_projeto"("projetoId");

-- CreateIndex
CREATE INDEX "arquivo_projeto_versao_arquivoId_idx" ON "arquivo_projeto_versao"("arquivoId");

-- CreateIndex
CREATE UNIQUE INDEX "arquivo_projeto_versao_arquivoId_numero_key" ON "arquivo_projeto_versao"("arquivoId", "numero");

-- CreateIndex
CREATE INDEX "funcionario_documento_userId_idx" ON "funcionario_documento"("userId");

-- CreateIndex
CREATE INDEX "documento_juridico_pastaId_idx" ON "documento_juridico"("pastaId");

-- AddForeignKey
ALTER TABLE "documento_juridico" ADD CONSTRAINT "documento_juridico_pastaId_fkey" FOREIGN KEY ("pastaId") REFERENCES "pasta_juridica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasta_juridica" ADD CONSTRAINT "pasta_juridica_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "pasta_juridica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivo_projeto" ADD CONSTRAINT "arquivo_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivo_projeto_versao" ADD CONSTRAINT "arquivo_projeto_versao_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivo_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funcionario_documento" ADD CONSTRAINT "funcionario_documento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
