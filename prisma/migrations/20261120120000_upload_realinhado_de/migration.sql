-- AlterTable
ALTER TABLE "upload" ADD COLUMN     "realinhadoDeId" TEXT;

-- CreateIndex
CREATE INDEX "upload_realinhadoDeId_idx" ON "upload"("realinhadoDeId");

