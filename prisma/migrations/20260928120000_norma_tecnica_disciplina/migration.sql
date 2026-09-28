-- Normas técnicas em pastas por disciplina (chamado de 2026-09-10, Ana Paula): junção N:N norma ↔
-- disciplina do catálogo. Aditiva: norma sem linha aqui fica na pasta "Geral", então as normas que já
-- existem continuam aparecendo (e são classificadas pela tela, em "Editar").

-- CreateTable
CREATE TABLE "norma_tecnica_disciplina" (
    "id" TEXT NOT NULL,
    "normaId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,

    CONSTRAINT "norma_tecnica_disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "norma_tecnica_disciplina_disciplinaId_idx" ON "norma_tecnica_disciplina"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "norma_tecnica_disciplina_normaId_disciplinaId_key" ON "norma_tecnica_disciplina"("normaId", "disciplinaId");

-- AddForeignKey
ALTER TABLE "norma_tecnica_disciplina" ADD CONSTRAINT "norma_tecnica_disciplina_normaId_fkey" FOREIGN KEY ("normaId") REFERENCES "norma_tecnica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "norma_tecnica_disciplina" ADD CONSTRAINT "norma_tecnica_disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

