-- CreateTable
CREATE TABLE "pedido_revisao_cliente" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "revisaoId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "resposta" TEXT,
    "respondidoPorId" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_revisao_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcacao_pedido_cliente" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "pagina" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "texto" TEXT NOT NULL,
    "marcacaoTipo" TEXT,
    "marcacaoGeo" JSONB,
    "medidaMm" DOUBLE PRECISION,
    "medidaFator" DOUBLE PRECISION,
    "medidaModo" TEXT,
    "pendenciaId" TEXT,

    CONSTRAINT "marcacao_pedido_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexo_pedido_cliente" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexo_pedido_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_projetoId_status_idx" ON "pedido_revisao_cliente"("projetoId", "status");

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_status_createdAt_idx" ON "pedido_revisao_cliente"("status", "createdAt");

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_revisaoId_idx" ON "pedido_revisao_cliente"("revisaoId");

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_documentoId_idx" ON "pedido_revisao_cliente"("documentoId");

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_uploadId_idx" ON "pedido_revisao_cliente"("uploadId");

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_autorId_idx" ON "pedido_revisao_cliente"("autorId");

-- CreateIndex
CREATE INDEX "pedido_revisao_cliente_respondidoPorId_idx" ON "pedido_revisao_cliente"("respondidoPorId");

-- CreateIndex
CREATE INDEX "marcacao_pedido_cliente_pedidoId_ordem_idx" ON "marcacao_pedido_cliente"("pedidoId", "ordem");

-- CreateIndex
CREATE INDEX "anexo_pedido_cliente_pedidoId_idx" ON "anexo_pedido_cliente"("pedidoId");

-- AddForeignKey
ALTER TABLE "pedido_revisao_cliente" ADD CONSTRAINT "pedido_revisao_cliente_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_revisao_cliente" ADD CONSTRAINT "pedido_revisao_cliente_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_revisao_cliente" ADD CONSTRAINT "pedido_revisao_cliente_revisaoId_fkey" FOREIGN KEY ("revisaoId") REFERENCES "documento_revisao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_revisao_cliente" ADD CONSTRAINT "pedido_revisao_cliente_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_revisao_cliente" ADD CONSTRAINT "pedido_revisao_cliente_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_revisao_cliente" ADD CONSTRAINT "pedido_revisao_cliente_respondidoPorId_fkey" FOREIGN KEY ("respondidoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcacao_pedido_cliente" ADD CONSTRAINT "marcacao_pedido_cliente_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido_revisao_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_pedido_cliente" ADD CONSTRAINT "anexo_pedido_cliente_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido_revisao_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

