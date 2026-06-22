-- Dedup de Tarefa gerada da EAP (P-32).
ALTER TABLE "tarefa" ADD COLUMN "eapTarefaId" TEXT;

CREATE UNIQUE INDEX "tarefa_eapTarefaId_key" ON "tarefa"("eapTarefaId");
