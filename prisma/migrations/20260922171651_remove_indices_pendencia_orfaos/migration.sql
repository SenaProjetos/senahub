-- Índices órfãos: existiam em alguns bancos (herdados de `db push`), não em todos.
-- `IF EXISTS` é obrigatório aqui — sem ele a migration derruba o deploy em qualquer
-- banco que nunca teve o índice. Ver docs: DROP em produção sai junto com o código.

-- DropIndex
DROP INDEX IF EXISTS "pendencia_prazo_idx";

-- DropIndex
DROP INDEX IF EXISTS "pendencia_publicadoEm_idx";

-- DropIndex
DROP INDEX IF EXISTS "pendencia_anexo_pendenciaId_momento_idx";
