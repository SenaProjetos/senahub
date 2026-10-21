-- Separada da anterior: um valor novo de enum não pode ser usado na transação em que nasce.
-- Um controle ativo de cada tipo "de pasta" ou de revisão pelo cliente, por revisão.
DROP INDEX "controle_revisao_um_ativo";

CREATE UNIQUE INDEX "controle_revisao_um_ativo" ON "controle_revisao"("revisaoId", "tipo")
  WHERE "removidoEm" IS NULL AND "tipo" IN ('liberado_obra', 'enviado_cliente', 'em_revisao');
