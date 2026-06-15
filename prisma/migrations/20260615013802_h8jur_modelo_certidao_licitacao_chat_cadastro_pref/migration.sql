-- CreateEnum
CREATE TYPE "StatusSolicCadastro" AS ENUM ('pendente', 'aprovada', 'recusada');

-- CreateTable
CREATE TABLE "mensagem_leitura" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_leitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_contrato" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "conteudo" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacao_cadastro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "mensagem" TEXT,
    "status" "StatusSolicCadastro" NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacao_cadastro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preference" (
    "userId" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "certidao_versao" (
    "id" TEXT NOT NULL,
    "certidaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "validade" DATE NOT NULL,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certidao_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitacao_historico" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplina_valor_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "disciplina" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "disciplina_valor_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagem_leitura_mensagemId_idx" ON "mensagem_leitura"("mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_leitura_mensagemId_userId_key" ON "mensagem_leitura"("mensagemId", "userId");

-- CreateIndex
CREATE INDEX "solicitacao_cadastro_status_idx" ON "solicitacao_cadastro"("status");

-- CreateIndex
CREATE UNIQUE INDEX "certidao_versao_certidaoId_numero_key" ON "certidao_versao"("certidaoId", "numero");

-- CreateIndex
CREATE INDEX "licitacao_historico_licitacaoId_idx" ON "licitacao_historico"("licitacaoId");

-- CreateIndex
CREATE INDEX "disciplina_valor_licitacao_licitacaoId_idx" ON "disciplina_valor_licitacao"("licitacaoId");

-- AddForeignKey
ALTER TABLE "mensagem_leitura" ADD CONSTRAINT "mensagem_leitura_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_leitura" ADD CONSTRAINT "mensagem_leitura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certidao_versao" ADD CONSTRAINT "certidao_versao_certidaoId_fkey" FOREIGN KEY ("certidaoId") REFERENCES "certidao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao_historico" ADD CONSTRAINT "licitacao_historico_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplina_valor_licitacao" ADD CONSTRAINT "disciplina_valor_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
