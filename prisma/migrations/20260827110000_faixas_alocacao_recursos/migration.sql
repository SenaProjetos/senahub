-- Permite preservar faixas distintas para o mesmo recurso no mesmo projeto.
-- Linhas legadas permanecem intactas; a validação de sobreposição fica na camada de domínio.
DROP INDEX "alocacao_recursoId_projetoId_key";

CREATE INDEX "alocacao_recursoId_projetoId_inicio_idx"
ON "alocacao"("recursoId", "projetoId", "inicio");
