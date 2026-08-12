-- Link público de inputs ganha validade e trava de notificação.
-- Ambas nullable: tabela populada segue válida sem backfill.
ALTER TABLE "link_publico_input" ADD COLUMN "expiraEm" TIMESTAMP(3);
ALTER TABLE "link_publico_input" ADD COLUMN "notificadoEm" TIMESTAMP(3);
