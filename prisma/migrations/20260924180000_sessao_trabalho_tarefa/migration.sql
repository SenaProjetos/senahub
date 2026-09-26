-- F6 — Apontamento por tarefa (D20). Aditiva: duas colunas NULL e um índice; nenhuma linha
-- existente muda. Sessão sem tarefa continua valendo exatamente como valia.

-- AlterTable
ALTER TABLE "batida" ADD COLUMN     "tarefaId" TEXT;

-- AlterTable
ALTER TABLE "sessao_trabalho" ADD COLUMN     "tarefaId" TEXT;

-- CreateIndex
CREATE INDEX "sessao_trabalho_tarefaId_idx" ON "sessao_trabalho"("tarefaId");

-- AddForeignKey
ALTER TABLE "sessao_trabalho" ADD CONSTRAINT "sessao_trabalho_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
