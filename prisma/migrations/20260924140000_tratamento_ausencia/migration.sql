-- CreateEnum
CREATE TYPE "TratamentoAusencia" AS ENUM ('abonar', 'banco_horas');

-- AlterTable (aditivo: aprovações existentes continuam abonadas)
ALTER TABLE "abono_falta" ADD COLUMN     "tratamento" "TratamentoAusencia" NOT NULL DEFAULT 'abonar';
