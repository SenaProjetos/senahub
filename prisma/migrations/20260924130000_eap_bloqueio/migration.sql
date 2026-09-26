-- Bloqueio (Doc 03 §27, D40): motivo e previsão de solução.
--
-- Origem do bloqueio reusa `origemId` (já existe na linha) em vez de criar campo próprio —
-- classificador de origem já cobre "cliente", "arquitetura", "fiscalização" etc.
--
-- Aditiva.

ALTER TABLE "eap_tarefa" ADD COLUMN IF NOT EXISTS "motivoBloqueio" TEXT;
ALTER TABLE "eap_tarefa" ADD COLUMN IF NOT EXISTS "previsaoDesbloqueio" DATE;
