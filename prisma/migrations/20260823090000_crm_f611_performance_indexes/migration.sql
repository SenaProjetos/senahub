-- F6.11: paginação dos Kanbans e filas operacionais da Home/Meu Dia.
CREATE INDEX "compromisso_concluidoEm_inicio_idx"
ON "compromisso"("concluidoEm", "inicio");

CREATE INDEX "lead_status_arquivado_excluidoEm_updatedAt_idx"
ON "lead"("status", "arquivado", "excluidoEm", "updatedAt");

CREATE INDEX "negociacao_estagio_excluidoEm_updatedAt_idx"
ON "negociacao"("estagio", "excluidoEm", "updatedAt");

CREATE INDEX "proposta_status_enviadaEm_idx"
ON "proposta"("status", "enviadaEm");

CREATE INDEX "proposta_status_validade_idx"
ON "proposta"("status", "validade");
