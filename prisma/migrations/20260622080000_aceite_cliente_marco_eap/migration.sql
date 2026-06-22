-- AlterTable
ALTER TABLE "eap_tarefa" ADD COLUMN     "marco" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "aceite_cliente" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "respondidoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "geradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceite_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aceite_cliente_uploadId_key" ON "aceite_cliente"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "aceite_cliente_token_key" ON "aceite_cliente"("token");

-- AddForeignKey
ALTER TABLE "aceite_cliente" ADD CONSTRAINT "aceite_cliente_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceite_cliente" ADD CONSTRAINT "aceite_cliente_geradoPorId_fkey" FOREIGN KEY ("geradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
