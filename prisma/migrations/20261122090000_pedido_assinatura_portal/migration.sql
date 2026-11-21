-- CreateEnum
CREATE TYPE "StatusPedidoAssinatura" AS ENUM ('aguardando', 'assinado', 'cancelado');

-- CreateTable
CREATE TABLE "pedido_assinatura_portal" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "status" "StatusPedidoAssinatura" NOT NULL DEFAULT 'aguardando',
    "pedidoPorId" TEXT NOT NULL,
    "pedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoPorId" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "assinadoPorId" TEXT,
    "assinadoPorNome" TEXT,
    "assinadoEm" TIMESTAMP(3),
    "aceiteId" TEXT,

    CONSTRAINT "pedido_assinatura_portal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedido_assinatura_portal_aceiteId_key" ON "pedido_assinatura_portal"("aceiteId");

-- CreateIndex
CREATE INDEX "pedido_assinatura_portal_documentoId_status_idx" ON "pedido_assinatura_portal"("documentoId", "status");

-- CreateIndex
CREATE INDEX "pedido_assinatura_portal_versaoId_idx" ON "pedido_assinatura_portal"("versaoId");

-- AddForeignKey
ALTER TABLE "pedido_assinatura_portal" ADD CONSTRAINT "pedido_assinatura_portal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_juridico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_assinatura_portal" ADD CONSTRAINT "pedido_assinatura_portal_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "doc_juridico_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um só pedido aguardando por documento (índice parcial, fora do schema.prisma).
CREATE UNIQUE INDEX "pedido_assinatura_portal_um_aguardando" ON "pedido_assinatura_portal" ("documentoId") WHERE "status" = 'aguardando';
