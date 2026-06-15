-- AlterEnum
ALTER TYPE "StatusLancamento" ADD VALUE 'aguardando_aprovacao';

-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "aprovadoEm" TIMESTAMP(3),
ADD COLUMN     "aprovadoPorId" TEXT,
ADD COLUMN     "motivoRejeicao" TEXT;
