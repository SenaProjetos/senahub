-- AlterTable
ALTER TABLE "mensagem" ADD COLUMN     "excluidaEm" TIMESTAMP(3),
ADD COLUMN     "respostaAId" TEXT;

-- CreateTable
CREATE TABLE "mensagem_reacao" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_reacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagem_reacao_mensagemId_idx" ON "mensagem_reacao"("mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_reacao_mensagemId_userId_emoji_key" ON "mensagem_reacao"("mensagemId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "mensagem_respostaAId_idx" ON "mensagem"("respostaAId");

-- AddForeignKey
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_respostaAId_fkey" FOREIGN KEY ("respostaAId") REFERENCES "mensagem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_reacao" ADD CONSTRAINT "mensagem_reacao_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_reacao" ADD CONSTRAINT "mensagem_reacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
