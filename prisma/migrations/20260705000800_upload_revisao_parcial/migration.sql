-- AlterTable
ALTER TABLE "upload" ADD COLUMN     "revisaoEm" TIMESTAMP(3),
ADD COLUMN     "revisaoObs" TEXT,
ADD COLUMN     "revisaoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_revisaoPorId_fkey" FOREIGN KEY ("revisaoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
