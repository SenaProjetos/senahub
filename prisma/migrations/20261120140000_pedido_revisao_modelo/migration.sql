-- Pedido de revisão no modelo 3D (spec 2026-11-20-portal-visualizador-3d-design.md, etapa 3): o pedido ganha um tipo
-- (prancha | modelo). No modelo não há upload/revisão/documento únicos — cada marcação 3D aponta o seu modelo.
-- AlterTable
ALTER TABLE "pedido_revisao_cliente" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'prancha',
ALTER COLUMN "documentoId" DROP NOT NULL,
ALTER COLUMN "revisaoId" DROP NOT NULL,
ALTER COLUMN "uploadId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "marcacao_modelo_cliente" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "modeloId" TEXT NOT NULL,
    "origemUploadId" TEXT,
    "documentoRecebidoId" TEXT,
    "guids" JSONB NOT NULL,
    "ponto" JSONB NOT NULL,
    "camera" JSONB NOT NULL,
    "texto" TEXT NOT NULL,
    "snapshotPath" TEXT,
    "apontamentoId" TEXT,

    CONSTRAINT "marcacao_modelo_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marcacao_modelo_cliente_pedidoId_ordem_idx" ON "marcacao_modelo_cliente"("pedidoId", "ordem");

-- AddForeignKey
ALTER TABLE "marcacao_modelo_cliente" ADD CONSTRAINT "marcacao_modelo_cliente_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedido_revisao_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- O tipo só pode ser um dos dois (modules/portal/pedido-revisao/regras.ts TIPOS_PEDIDO); a restrição fica no banco
-- (não representável no schema.prisma), como a do status.
ALTER TABLE "pedido_revisao_cliente"
  ADD CONSTRAINT "pedido_revisao_cliente_tipo_check"
  CHECK ("tipo" IN ('prancha', 'modelo'));

-- A prancha continua com upload, documento e revisão obrigatórios: só o pedido de modelo dispensa os três.
ALTER TABLE "pedido_revisao_cliente"
  ADD CONSTRAINT "pedido_revisao_cliente_prancha_completa_check"
  CHECK ("tipo" <> 'prancha' OR ("uploadId" IS NOT NULL AND "documentoId" IS NOT NULL AND "revisaoId" IS NOT NULL));
