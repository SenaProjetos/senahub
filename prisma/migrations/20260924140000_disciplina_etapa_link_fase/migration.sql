-- F4 do motor de planejamento: disciplina × etapa (D30/D37) e link público por fase (D37b).
--
-- Aditiva. Nenhuma coluna existente muda de significado:
--   - `disciplina_etapa` nasce VAZIA. Toda disciplina existente segue sem etapa e se
--     comporta exatamente como antes — nada cria etapa sozinho.
--   - `link_publico_arquivos.faseIds` nasce `{}`, que significa "todas as fases" (semântica
--     INVERTIDA em relação a `disciplinaIds`, ver schema). É o que mantém cada link no ar
--     servindo exatamente o que servia: vazio aqui não pode estreitar nada.

-- CreateTable
CREATE TABLE "disciplina_etapa" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "prazo" DATE,
    "status" "StatusDisciplina" NOT NULL DEFAULT 'aguardando',
    "entregueEm" TIMESTAMP(3),
    "percentual" DECIMAL(5,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplina_etapa_pkey" PRIMARY KEY ("id")
);

-- A fase é a identidade da etapa: uma disciplina não tem dois "Projeto Básico".
CREATE UNIQUE INDEX "disciplina_etapa_disciplinaId_etapaId_key"
    ON "disciplina_etapa"("disciplinaId", "etapaId");

CREATE INDEX "disciplina_etapa_etapaId_idx" ON "disciplina_etapa"("etapaId");

ALTER TABLE "disciplina_etapa"
  ADD CONSTRAINT "disciplina_etapa_disciplinaId_fkey"
  FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: excluir uma fase em uso apagaria prazo e percentual (CASCADE) ou deixaria uma
-- etapa sem saber de que fase é (SET NULL). A recusa amigável mora em
-- `excluirCatalogoPrancha`, que entra no mesmo deploy que esta migration.
ALTER TABLE "disciplina_etapa"
  ADD CONSTRAINT "disciplina_etapa_etapaId_fkey"
  FOREIGN KEY ("etapaId") REFERENCES "prancha_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "link_publico_arquivos"
  ADD COLUMN IF NOT EXISTS "faseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "incluirSemFase" BOOLEAN NOT NULL DEFAULT false;
