-- CreateEnum
CREATE TYPE "StatusAprovacaoEntrega" AS ENUM ('aguardando', 'respondido', 'cancelado');

-- CreateEnum
CREATE TYPE "RespostaEntrega" AS ENUM ('aprovado', 'aprovado_com_ressalvas', 'nao_aprovado');

-- CreateEnum
CREATE TYPE "OrigemRespostaEntrega" AS ENUM ('portal', 'equipe');

-- CreateTable
CREATE TABLE "aprovacao_entrega" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT,
    "status" "StatusAprovacaoEntrega" NOT NULL DEFAULT 'aguardando',
    "impressaoDigital" TEXT NOT NULL,
    "parcelaId" TEXT,
    "enviadoPorId" TEXT NOT NULL,
    "enviadoPorNome" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoPorId" TEXT,
    "canceladoEm" TIMESTAMP(3),

    CONSTRAINT "aprovacao_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprovacao_entrega_item" (
    "id" TEXT NOT NULL,
    "aprovacaoId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "revisaoId" TEXT,
    "documentoId" TEXT,
    "disciplinaId" TEXT,
    "disciplinaNome" TEXT NOT NULL,
    "faseSigla" TEXT,
    "documentoTitulo" TEXT NOT NULL,
    "revisaoRotulo" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "aprovacao_entrega_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resposta_aprovacao_entrega" (
    "id" TEXT NOT NULL,
    "aprovacaoId" TEXT NOT NULL,
    "resposta" "RespostaEntrega" NOT NULL,
    "texto" TEXT,
    "origem" "OrigemRespostaEntrega" NOT NULL,
    "respondidoPorId" TEXT,
    "respondidoPorNome" TEXT NOT NULL,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "respondidoEm" TIMESTAMP(3) NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressaoDigital" TEXT NOT NULL,
    "comprovanteId" TEXT,
    "anuladaEm" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "anuladaPorNome" TEXT,
    "motivoAnulacao" TEXT,

    CONSTRAINT "resposta_aprovacao_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprovante_aprovacao_entrega" (
    "id" TEXT NOT NULL,
    "aprovacaoId" TEXT NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usadoEm" TIMESTAMP(3),

    CONSTRAINT "comprovante_aprovacao_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aprovacao_entrega_projetoId_enviadoEm_idx" ON "aprovacao_entrega"("projetoId", "enviadoEm");

-- CreateIndex
CREATE INDEX "aprovacao_entrega_parcelaId_idx" ON "aprovacao_entrega"("parcelaId");

-- CreateIndex
CREATE INDEX "aprovacao_entrega_item_aprovacaoId_idx" ON "aprovacao_entrega_item"("aprovacaoId");

-- CreateIndex
CREATE INDEX "aprovacao_entrega_item_uploadId_idx" ON "aprovacao_entrega_item"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "resposta_aprovacao_entrega_comprovanteId_key" ON "resposta_aprovacao_entrega"("comprovanteId");

-- CreateIndex
CREATE INDEX "resposta_aprovacao_entrega_aprovacaoId_idx" ON "resposta_aprovacao_entrega"("aprovacaoId");

-- CreateIndex
CREATE INDEX "comprovante_aprovacao_entrega_aprovacaoId_idx" ON "comprovante_aprovacao_entrega"("aprovacaoId");

-- CreateIndex
CREATE INDEX "comprovante_aprovacao_entrega_usadoEm_criadoEm_idx" ON "comprovante_aprovacao_entrega"("usadoEm", "criadoEm");

-- AddForeignKey
ALTER TABLE "aprovacao_entrega" ADD CONSTRAINT "aprovacao_entrega_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_entrega" ADD CONSTRAINT "aprovacao_entrega_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "contrato_parcela_entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_entrega_item" ADD CONSTRAINT "aprovacao_entrega_item_aprovacaoId_fkey" FOREIGN KEY ("aprovacaoId") REFERENCES "aprovacao_entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_aprovacao_entrega" ADD CONSTRAINT "resposta_aprovacao_entrega_aprovacaoId_fkey" FOREIGN KEY ("aprovacaoId") REFERENCES "aprovacao_entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_aprovacao_entrega" ADD CONSTRAINT "resposta_aprovacao_entrega_comprovanteId_fkey" FOREIGN KEY ("comprovanteId") REFERENCES "comprovante_aprovacao_entrega"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprovante_aprovacao_entrega" ADD CONSTRAINT "comprovante_aprovacao_entrega_aprovacaoId_fkey" FOREIGN KEY ("aprovacaoId") REFERENCES "aprovacao_entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- No máximo UMA resposta não anulada por pacote (fora do schema.prisma, como os outros índices parciais).
CREATE UNIQUE INDEX "resposta_aprovacao_entrega_uma_ativa" ON "resposta_aprovacao_entrega" ("aprovacaoId") WHERE "anuladaEm" IS NULL;
