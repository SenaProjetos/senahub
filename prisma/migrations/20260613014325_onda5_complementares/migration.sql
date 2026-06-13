-- CreateEnum
CREATE TYPE "StatusLicitacao" AS ENUM ('em_andamento', 'ganha', 'perdida', 'em_execucao', 'concluida');

-- CreateEnum
CREATE TYPE "StatusTicket" AS ENUM ('aberto', 'em_atendimento', 'resolvido');

-- CreateTable
CREATE TABLE "tarefa_status" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "cor" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tarefa_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "statusId" TEXT NOT NULL,
    "prazo" DATE,
    "projetoId" TEXT,
    "criadorId" TEXT NOT NULL,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_responsavel" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "tarefa_responsavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_item" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tarefa_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_dependencia" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "dependeDeId" TEXT NOT NULL,

    CONSTRAINT "tarefa_dependencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_juridico" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'contrato',
    "projetoId" TEXT,
    "clienteId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_juridico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_juridico_versao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "arquivoPath" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_juridico_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certidao_tipo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "certidao_tipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certidao" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "descricao" TEXT,
    "validade" DATE NOT NULL,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certidao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitacao" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "orgao" TEXT,
    "modalidade" TEXT,
    "numeroEdital" TEXT,
    "prazoProposta" DATE,
    "valorEstimado" DECIMAL(14,2),
    "status" "StatusLicitacao" NOT NULL DEFAULT 'em_andamento',
    "observacoes" TEXT,
    "projetoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,

    CONSTRAINT "documento_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_licitacao_versao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "arquivoPath" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_licitacao_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicao_licitacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "data" DATE NOT NULL,
    "lancamentoId" TEXT,

    CONSTRAINT "medicao_licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compromisso" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "local" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "criadorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compromisso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compromisso_participante" (
    "id" TEXT NOT NULL,
    "compromissoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "confirmado" BOOLEAN,

    CONSTRAINT "compromisso_participante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualidade_snapshot" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "indice" DECIMAL(5,2) NOT NULL,
    "totalDisciplinas" INTEGER NOT NULL,
    "comRevisao" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualidade_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_suporte" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusTicket" NOT NULL DEFAULT 'aberto',
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_suporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_mensagem" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_status_nome_key" ON "tarefa_status"("nome");

-- CreateIndex
CREATE INDEX "tarefa_statusId_arquivada_idx" ON "tarefa"("statusId", "arquivada");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_responsavel_tarefaId_userId_key" ON "tarefa_responsavel"("tarefaId", "userId");

-- CreateIndex
CREATE INDEX "tarefa_item_tarefaId_idx" ON "tarefa_item"("tarefaId");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_dependencia_tarefaId_dependeDeId_key" ON "tarefa_dependencia"("tarefaId", "dependeDeId");

-- CreateIndex
CREATE INDEX "documento_juridico_projetoId_idx" ON "documento_juridico"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "doc_juridico_versao_documentoId_numero_key" ON "doc_juridico_versao"("documentoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "certidao_tipo_nome_key" ON "certidao_tipo"("nome");

-- CreateIndex
CREATE INDEX "certidao_validade_idx" ON "certidao"("validade");

-- CreateIndex
CREATE UNIQUE INDEX "licitacao_projetoId_key" ON "licitacao"("projetoId");

-- CreateIndex
CREATE INDEX "licitacao_status_idx" ON "licitacao"("status");

-- CreateIndex
CREATE INDEX "documento_licitacao_licitacaoId_idx" ON "documento_licitacao"("licitacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "doc_licitacao_versao_documentoId_numero_key" ON "doc_licitacao_versao"("documentoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "medicao_licitacao_lancamentoId_key" ON "medicao_licitacao"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "medicao_licitacao_licitacaoId_numero_key" ON "medicao_licitacao"("licitacaoId", "numero");

-- CreateIndex
CREATE INDEX "compromisso_inicio_idx" ON "compromisso"("inicio");

-- CreateIndex
CREATE UNIQUE INDEX "compromisso_participante_compromissoId_userId_key" ON "compromisso_participante"("compromissoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "qualidade_snapshot_ano_mes_key" ON "qualidade_snapshot"("ano", "mes");

-- CreateIndex
CREATE INDEX "ticket_suporte_status_idx" ON "ticket_suporte"("status");

-- CreateIndex
CREATE INDEX "ticket_mensagem_ticketId_idx" ON "ticket_mensagem"("ticketId");

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "tarefa_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_criadorId_fkey" FOREIGN KEY ("criadorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_responsavel" ADD CONSTRAINT "tarefa_responsavel_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_responsavel" ADD CONSTRAINT "tarefa_responsavel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_item" ADD CONSTRAINT "tarefa_item_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_dependencia" ADD CONSTRAINT "tarefa_dependencia_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_dependencia" ADD CONSTRAINT "tarefa_dependencia_dependeDeId_fkey" FOREIGN KEY ("dependeDeId") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_juridico" ADD CONSTRAINT "documento_juridico_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_juridico" ADD CONSTRAINT "documento_juridico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_juridico_versao" ADD CONSTRAINT "doc_juridico_versao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_juridico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_juridico_versao" ADD CONSTRAINT "doc_juridico_versao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certidao" ADD CONSTRAINT "certidao_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "certidao_tipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao" ADD CONSTRAINT "licitacao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_licitacao" ADD CONSTRAINT "documento_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_licitacao_versao" ADD CONSTRAINT "doc_licitacao_versao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_licitacao_versao" ADD CONSTRAINT "doc_licitacao_versao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicao_licitacao" ADD CONSTRAINT "medicao_licitacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso" ADD CONSTRAINT "compromisso_criadorId_fkey" FOREIGN KEY ("criadorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso_participante" ADD CONSTRAINT "compromisso_participante_compromissoId_fkey" FOREIGN KEY ("compromissoId") REFERENCES "compromisso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso_participante" ADD CONSTRAINT "compromisso_participante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_suporte" ADD CONSTRAINT "ticket_suporte_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_mensagem" ADD CONSTRAINT "ticket_mensagem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket_suporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_mensagem" ADD CONSTRAINT "ticket_mensagem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
