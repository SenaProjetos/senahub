-- AlterTable
ALTER TABLE "licitacao" ADD COLUMN     "subcontratacaoMaxPct" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "responsavel_tecnico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "registro" TEXT NOT NULL,
    "conselho" TEXT,
    "userId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsavel_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitacao_responsavel_tecnico" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "documentoTipo" TEXT NOT NULL,
    "numeroDocumento" TEXT,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_responsavel_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontratacao_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "nomeLivre" TEXT,
    "objeto" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "subcontratacao_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "responsavel_tecnico_userId_key" ON "responsavel_tecnico"("userId");

-- CreateIndex
CREATE INDEX "licitacao_responsavel_tecnico_responsavelId_idx" ON "licitacao_responsavel_tecnico"("responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "licitacao_responsavel_tecnico_licitacaoId_responsavelId_doc_key" ON "licitacao_responsavel_tecnico"("licitacaoId", "responsavelId", "documentoTipo");

-- CreateIndex
CREATE INDEX "subcontratacao_licitacao_licitacaoId_idx" ON "subcontratacao_licitacao"("licitacaoId");

-- AddForeignKey
ALTER TABLE "responsavel_tecnico" ADD CONSTRAINT "responsavel_tecnico_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao_responsavel_tecnico" ADD CONSTRAINT "licitacao_responsavel_tecnico_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao_responsavel_tecnico" ADD CONSTRAINT "licitacao_responsavel_tecnico_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "responsavel_tecnico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontratacao_licitacao" ADD CONSTRAINT "subcontratacao_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontratacao_licitacao" ADD CONSTRAINT "subcontratacao_licitacao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
