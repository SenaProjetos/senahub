-- F6D do planejador financeiro: fechar a folha CLT mensal QUITA a conta a pagar prevista da
-- competência (a que o compromisso recorrente gerou, ou uma lançada à mão) em vez de criar outra
-- despesa — senão o mês fica com o previsto e o confirmado, e a projeção desconta o caixa duas vezes.
--
-- As duas colunas guardam o que reabrir a folha precisa saber: se o lançamento já existia antes do
-- fechamento (reabrir devolve ele ao previsto, nunca apaga) e qual valor ele tinha (o fechamento
-- grava o valor real da folha).
ALTER TABLE "folha_pagamento"
  ADD COLUMN IF NOT EXISTS "lancamentoReaproveitado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lancamentoValorPrevisto" DECIMAL(14,2);
