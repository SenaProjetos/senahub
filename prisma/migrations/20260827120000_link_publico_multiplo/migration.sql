-- Vários links públicos de arquivos por projeto, com escopo explícito.
--
-- O `@unique` em projetoId virou índice comum: um projeto pode ter um link para o
-- cliente, outro para a prefeitura, outro para um consultor — cada um com sua
-- validade e seu recorte.
--
-- `escopo` entra com default 'disciplinas', que é exatamente a regra de hoje. Isso é
-- deliberado: sem a coluna, `disciplinaIds` vazio teria de significar "nada" (regra
-- atual) e "tudo" (o pedido novo) ao mesmo tempo, e todo link já existente com
-- whitelist vazia viraria um link do projeto inteiro — vazamento silencioso.

-- CreateEnum
CREATE TYPE "EscopoLinkArquivos" AS ENUM ('disciplinas', 'projeto_todo', 'selecao');

-- AlterTable
ALTER TABLE "link_publico_arquivos"
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "escopo" "EscopoLinkArquivos" NOT NULL DEFAULT 'disciplinas',
  ADD COLUMN "uploadIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropIndex
DROP INDEX "link_publico_arquivos_projetoId_key";

-- CreateIndex
CREATE INDEX "link_publico_arquivos_projetoId_idx" ON "link_publico_arquivos"("projetoId");
