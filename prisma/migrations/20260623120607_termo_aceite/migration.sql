-- CreateEnum
CREATE TYPE "TipoTermo" AS ENUM ('colaborador', 'cliente');

-- CreateTable
CREATE TABLE "aceite_termo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoTermo" NOT NULL,
    "versao" TEXT NOT NULL,
    "conteudoHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceite_termo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aceite_termo_userId_tipo_idx" ON "aceite_termo"("userId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "aceite_termo_userId_tipo_versao_key" ON "aceite_termo"("userId", "tipo", "versao");

-- AddForeignKey
ALTER TABLE "aceite_termo" ADD CONSTRAINT "aceite_termo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
