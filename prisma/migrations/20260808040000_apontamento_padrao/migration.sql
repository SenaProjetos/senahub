-- Item 10: biblioteca de apontamentos-padrão por disciplina. Tabela nova, nasce vazia.
-- Catálogo de DADO (o usuário cadastra), ao contrário do vocabulário fixo de severidade/tipo
-- (item 11), que vive em código.

CREATE TABLE "apontamento_padrao" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT,
    "texto" TEXT NOT NULL,
    "severidade" TEXT,
    "tipo" TEXT,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apontamento_padrao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "apontamento_padrao_disciplinaId_ativo_idx" ON "apontamento_padrao"("disciplinaId", "ativo");
CREATE INDEX "apontamento_padrao_autorId_idx" ON "apontamento_padrao"("autorId");

ALTER TABLE "apontamento_padrao" ADD CONSTRAINT "apontamento_padrao_disciplinaId_fkey"
  FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apontamento_padrao" ADD CONSTRAINT "apontamento_padrao_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
