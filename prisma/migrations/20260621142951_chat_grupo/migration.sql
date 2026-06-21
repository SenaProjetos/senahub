-- AlterEnum
ALTER TYPE "TipoCanal" ADD VALUE 'grupo';

-- AlterTable
ALTER TABLE "canal" ADD COLUMN     "criadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "canal_criadoPorId_idx" ON "canal"("criadoPorId");

-- AddForeignKey
ALTER TABLE "canal" ADD CONSTRAINT "canal_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
