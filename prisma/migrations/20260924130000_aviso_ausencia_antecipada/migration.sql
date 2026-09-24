-- CreateEnum
CREATE TYPE "MotivoAusencia" AS ENUM ('atestado', 'consulta', 'exame', 'compromisso', 'outro');

-- AlterTable (aditivo: linhas existentes viram motivoTipo=atestado, dia inteiro)
ALTER TABLE "abono_falta" ADD COLUMN     "horaFim" TEXT,
ADD COLUMN     "horaInicio" TEXT,
ADD COLUMN     "motivoTipo" "MotivoAusencia" NOT NULL DEFAULT 'atestado';
