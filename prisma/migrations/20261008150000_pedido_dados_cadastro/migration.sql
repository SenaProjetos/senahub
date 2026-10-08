-- O RH pede à pessoa que preencha os próprios dados que faltam (faixa "Atualize seus dados").
-- Aditiva: tabela nova, nada existente muda.

-- CreateEnum
CREATE TYPE "StatusPedidoDados" AS ENUM ('aberto', 'atendido', 'cancelado');

-- CreateTable
CREATE TABLE "pedido_dados_cadastro" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solicitadoPorId" TEXT NOT NULL,
    "mensagem" TEXT,
    "prazo" DATE,
    "status" "StatusPedidoDados" NOT NULL DEFAULT 'aberto',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidoEm" TIMESTAMP(3),
    "lembradoEm" TIMESTAMP(3),

    CONSTRAINT "pedido_dados_cadastro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedido_dados_cadastro_userId_status_idx" ON "pedido_dados_cadastro"("userId", "status");
CREATE INDEX "pedido_dados_cadastro_status_idx" ON "pedido_dados_cadastro"("status");

-- No máximo um pedido ABERTO por pessoa (índice parcial: fora do schema.prisma).
CREATE UNIQUE INDEX "pedido_dados_um_aberto" ON "pedido_dados_cadastro"("userId") WHERE "status" = 'aberto';

-- AddForeignKey
ALTER TABLE "pedido_dados_cadastro" ADD CONSTRAINT "pedido_dados_cadastro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
