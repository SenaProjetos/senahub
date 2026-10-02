-- N2 (núcleo do Financeiro): os relatórios, o aging e o planejador filtram por estas colunas e varriam a
-- tabela inteira. Só índices, aditiva.
CREATE INDEX IF NOT EXISTS "lancamento_dataConfirmacao_idx" ON "lancamento"("dataConfirmacao");
CREATE INDEX IF NOT EXISTS "lancamento_dataCompetencia_idx" ON "lancamento"("dataCompetencia");
CREATE INDEX IF NOT EXISTS "lancamento_categoriaId_idx" ON "lancamento"("categoriaId");
CREATE INDEX IF NOT EXISTS "lancamento_contaId_idx" ON "lancamento"("contaId");
CREATE INDEX IF NOT EXISTS "lancamento_clienteId_idx" ON "lancamento"("clienteId");
CREATE INDEX IF NOT EXISTS "lancamento_fornecedorId_idx" ON "lancamento"("fornecedorId");
CREATE INDEX IF NOT EXISTS "lancamento_centroId_idx" ON "lancamento"("centroId");
