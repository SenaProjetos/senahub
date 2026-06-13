-- AlterTable
ALTER TABLE "user" ADD COLUMN     "clienteId" TEXT;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
