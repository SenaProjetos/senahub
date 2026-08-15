-- CRM Fase 1c (F1.18): soft delete em Lead e ContatoCliente (ADR-11).
--
-- Aditiva e nullable — nenhuma linha existente muda de comportamento.
--
-- `Lead.excluidoEm` é distinto de `Lead.arquivado`, que já existia: arquivar tira o lead do
-- funil mas o mantém como registro vivo (e reversível pela UI); excluir é remoção lógica.
-- Os dois coexistem de propósito — a Fase 2 substitui `arquivado` pelo status DESCARTADO do
-- funil novo, e só então o campo antigo fica órfão.
ALTER TABLE "lead" ADD COLUMN "excluidoEm" TIMESTAMP(3);
CREATE INDEX "lead_excluidoEm_idx" ON "lead"("excluidoEm");

ALTER TABLE "contato_cliente" ADD COLUMN "excluidoEm" TIMESTAMP(3);
CREATE INDEX "contato_cliente_excluidoEm_idx" ON "contato_cliente"("excluidoEm");
