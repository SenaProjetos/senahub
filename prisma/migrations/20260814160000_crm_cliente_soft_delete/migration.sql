-- CRM Fase 1c (F1.17): soft delete em Cliente (ADR-11).
--
-- Aditiva e nullable — nenhuma linha existente muda de comportamento (todas nascem com
-- excluidoEm = NULL, ou seja, ativas).
--
-- O filtro automático fica na extensão do Prisma client (lib/prisma.ts), no mesmo padrão de
-- `lancamento` e `upload`. Ele intercepta apenas leituras TOP-LEVEL (findMany/count/findFirst/
-- aggregate/groupBy). NÃO afeta: findUnique, mutations, nem leitura por relação (`include`) --
-- e isso é desejado, porque um projeto/proposta antigo deve continuar mostrando de qual
-- cliente era, mesmo que o cadastro tenha sido excluído.
--
-- Índice: `excluidoEm` entra em toda listagem de cliente a partir de agora.
ALTER TABLE "cliente" ADD COLUMN "excluidoEm" TIMESTAMP(3);
CREATE INDEX "cliente_excluidoEm_idx" ON "cliente"("excluidoEm");
