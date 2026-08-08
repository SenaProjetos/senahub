-- Ancoragem textual dos apontamentos (item 3 da análise de apontamentos).
-- Todas as colunas são NULLABLE de propósito: linhas existentes ficam com NULL e continuam
-- se comportando exatamente como hoje (pino renderiza no (x,y) gravado). Não há backfill
-- possível — a âncora depende do texto do PDF, que só é extraído no cliente.

-- AlterTable
ALTER TABLE "pendencia" ADD COLUMN     "ancoraDx" DOUBLE PRECISION,
ADD COLUMN     "ancoraDy" DOUBLE PRECISION,
ADD COLUMN     "ancoraOffset" INTEGER,
ADD COLUMN     "ancoraTexto" TEXT;
