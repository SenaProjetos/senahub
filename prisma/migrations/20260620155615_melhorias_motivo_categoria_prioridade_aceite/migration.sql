-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "categoria" TEXT;

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "motivoPerda" TEXT;

-- AlterTable
ALTER TABLE "ticket_suporte" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "prioridade" TEXT;

-- CreateTable
CREATE TABLE "aceite_documento" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userNome" TEXT NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "assinadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceite_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aceite_documento_versaoId_idx" ON "aceite_documento"("versaoId");

-- AddForeignKey
ALTER TABLE "aceite_documento" ADD CONSTRAINT "aceite_documento_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "doc_juridico_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
