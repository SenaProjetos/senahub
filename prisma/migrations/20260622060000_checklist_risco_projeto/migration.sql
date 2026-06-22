-- N-34: checklist livre por projeto.
CREATE TABLE "checklist_item_projeto" (
  "id"          TEXT NOT NULL,
  "projetoId"   TEXT NOT NULL,
  "descricao"   TEXT NOT NULL,
  "concluido"   BOOLEAN NOT NULL DEFAULT false,
  "concluidoEm" TIMESTAMPTZ,
  "ordem"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "checklist_item_projeto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_item_projeto_projetoId_fkey"
    FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE
);

CREATE INDEX "checklist_item_projeto_projetoId_idx" ON "checklist_item_projeto"("projetoId");

-- N-39: registro de riscos do projeto.
CREATE TABLE "risco_projeto" (
  "id"            TEXT NOT NULL,
  "projetoId"     TEXT NOT NULL,
  "descricao"     TEXT NOT NULL,
  "probabilidade" INTEGER NOT NULL DEFAULT 1,
  "impacto"       INTEGER NOT NULL DEFAULT 1,
  "mitigacao"     TEXT,
  "status"        TEXT NOT NULL DEFAULT 'aberto',
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "risco_projeto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risco_projeto_projetoId_fkey"
    FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE
);

CREATE INDEX "risco_projeto_projetoId_idx" ON "risco_projeto"("projetoId");
