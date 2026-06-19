-- CreateEnum
CREATE TYPE "TipoSancao" AS ENUM ('advertencia', 'multa', 'suspensao', 'impedimento', 'inidoneidade');

-- CreateTable
CREATE TABLE "sancao_propria" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSancao" NOT NULL,
    "valor" DECIMAL(14,2),
    "inicio" DATE,
    "fim" DATE,
    "orgao" TEXT,
    "processo" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sancao_propria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sancao_concorrente" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "nomeLivre" TEXT,
    "tipo" "TipoSancao" NOT NULL,
    "valor" DECIMAL(14,2),
    "inicio" DATE,
    "fim" DATE,
    "orgao" TEXT,
    "processo" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sancao_concorrente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultado_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "vencedor" TEXT,
    "valorVencedor" DECIMAL(14,2),
    "nossaClassificacao" INTEGER,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resultado_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sancao_propria_fim_idx" ON "sancao_propria"("fim");

-- CreateIndex
CREATE INDEX "sancao_concorrente_fim_idx" ON "sancao_concorrente"("fim");

-- CreateIndex
CREATE UNIQUE INDEX "resultado_licitacao_licitacaoId_key" ON "resultado_licitacao"("licitacaoId");

-- AddForeignKey
ALTER TABLE "sancao_concorrente" ADD CONSTRAINT "sancao_concorrente_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_licitacao" ADD CONSTRAINT "resultado_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
