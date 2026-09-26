-- F7.2 (D25) — status próprio para a PREVISÃO de recebimento vinda do cronograma.
--
-- Sozinho nesta migration de propósito: o Postgres não deixa usar um valor novo de enum na mesma
-- transação que o criou, e nada aqui o usa. Aditivo: nenhuma linha existente muda.

-- AlterEnum
ALTER TYPE "StatusLancamento" ADD VALUE 'previsao';
