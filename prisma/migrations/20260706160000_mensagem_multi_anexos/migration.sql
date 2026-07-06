-- CreateTable
CREATE TABLE "mensagem_anexo" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagem_anexo_mensagemId_idx" ON "mensagem_anexo"("mensagemId");

-- AddForeignKey
ALTER TABLE "mensagem_anexo" ADD CONSTRAINT "mensagem_anexo_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
