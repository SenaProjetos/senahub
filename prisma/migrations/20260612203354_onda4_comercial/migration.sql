-- CreateEnum
CREATE TYPE "StatusProposta" AS ENUM ('rascunho', 'enviada', 'aceita', 'recusada');

-- CreateEnum
CREATE TYPE "TipoCondicao" AS ENUM ('percentual', 'valor');

-- CreateTable
CREATE TABLE "funil_etapa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "funil_etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contato" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "origem" TEXT,
    "valorEstimado" DECIMAL(14,2),
    "etapaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "observacoes" TEXT,
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividade_lead" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "nota" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividade_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_comercial" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "meta_comercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabela_preco" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tabela_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_tabela_preco" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "disciplina" TEXT NOT NULL,
    "valorM2" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "item_tabela_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_sequencia" (
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposta_sequencia_pkey" PRIMARY KEY ("ano")
);

-- CreateTable
CREATE TABLE "proposta" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "sequencial" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "leadId" TEXT,
    "status" "StatusProposta" NOT NULL DEFAULT 'rascunho',
    "areaM2" DECIMAL(12,2),
    "validade" DATE,
    "observacoes" TEXT,
    "token" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "projetoId" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "aceitaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_item" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "disciplina" TEXT NOT NULL,
    "descricao" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposta_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_condicao" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoCondicao" NOT NULL DEFAULT 'percentual',
    "valor" DECIMAL(14,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposta_condicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_versao" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_visualizacao" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_visualizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funil_etapa_nome_key" ON "funil_etapa"("nome");

-- CreateIndex
CREATE INDEX "lead_etapaId_arquivado_idx" ON "lead"("etapaId", "arquivado");

-- CreateIndex
CREATE INDEX "atividade_lead_leadId_idx" ON "atividade_lead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_comercial_ano_mes_key" ON "meta_comercial"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "tabela_preco_nome_key" ON "tabela_preco"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "item_tabela_preco_tabelaId_disciplina_key" ON "item_tabela_preco"("tabelaId", "disciplina");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_numero_key" ON "proposta"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_token_key" ON "proposta"("token");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_projetoId_key" ON "proposta"("projetoId");

-- CreateIndex
CREATE INDEX "proposta_status_idx" ON "proposta"("status");

-- CreateIndex
CREATE INDEX "proposta_clienteId_idx" ON "proposta"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_ano_sequencial_key" ON "proposta"("ano", "sequencial");

-- CreateIndex
CREATE INDEX "proposta_item_propostaId_idx" ON "proposta_item"("propostaId");

-- CreateIndex
CREATE INDEX "proposta_condicao_propostaId_idx" ON "proposta_condicao"("propostaId");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_versao_propostaId_numero_key" ON "proposta_versao"("propostaId", "numero");

-- CreateIndex
CREATE INDEX "proposta_visualizacao_propostaId_idx" ON "proposta_visualizacao"("propostaId");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "funil_etapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade_lead" ADD CONSTRAINT "atividade_lead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade_lead" ADD CONSTRAINT "atividade_lead_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_tabela_preco" ADD CONSTRAINT "item_tabela_preco_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "tabela_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_item" ADD CONSTRAINT "proposta_item_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_condicao" ADD CONSTRAINT "proposta_condicao_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_versao" ADD CONSTRAINT "proposta_versao_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_versao" ADD CONSTRAINT "proposta_versao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_visualizacao" ADD CONSTRAINT "proposta_visualizacao_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
