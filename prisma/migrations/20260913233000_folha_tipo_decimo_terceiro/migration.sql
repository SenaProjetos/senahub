-- Folha de 13º separada da folha mensal no mesmo mês (plano 2026-09-13-folha-clt-import-assinatura.md).
-- Gerada por `prisma migrate diff --from-schema <HEAD> --to-schema` (banco de dev com drift de outra
-- sessão; mesmo caminho das migrations anteriores deste plano). Folhas existentes viram `mensal`
-- pelo DEFAULT; a unicidade nova (ano, mes, tipo) é mais fraca que a antiga, então nenhuma linha
-- existente pode violá-la.

-- CreateEnum
CREATE TYPE "TipoFolha" AS ENUM ('mensal', 'decimo_terceiro');

-- DropIndex
DROP INDEX IF EXISTS "folha_pagamento_ano_mes_key";

-- AlterTable
ALTER TABLE "folha_pagamento" ADD COLUMN "tipo" "TipoFolha" NOT NULL DEFAULT 'mensal';

-- CreateIndex
CREATE UNIQUE INDEX "folha_pagamento_ano_mes_tipo_key" ON "folha_pagamento"("ano", "mes", "tipo");
