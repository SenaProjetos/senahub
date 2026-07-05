-- AlterTable
ALTER TABLE "tarefa" ADD COLUMN     "disciplinaId" TEXT;

-- CreateIndex
CREATE INDEX "tarefa_projetoId_idx" ON "tarefa"("projetoId");

-- CreateIndex
CREATE INDEX "tarefa_disciplinaId_idx" ON "tarefa"("disciplinaId");

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;
