-- CreateTable
CREATE TABLE "mensagem_entrega" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entregueEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_audicao" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ouvidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_audicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagem_entrega_mensagemId_idx" ON "mensagem_entrega"("mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_entrega_mensagemId_userId_key" ON "mensagem_entrega"("mensagemId", "userId");

-- CreateIndex
CREATE INDEX "mensagem_audicao_mensagemId_idx" ON "mensagem_audicao"("mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_audicao_mensagemId_userId_key" ON "mensagem_audicao"("mensagemId", "userId");

-- AddForeignKey
ALTER TABLE "mensagem_entrega" ADD CONSTRAINT "mensagem_entrega_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_entrega" ADD CONSTRAINT "mensagem_entrega_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_audicao" ADD CONSTRAINT "mensagem_audicao_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_audicao" ADD CONSTRAINT "mensagem_audicao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
