-- Coordenação BIM: vistas salvas (câmera + visibilidade + corte)
-- Compartilhada por projeto; pode ser restaurada por qualquer membro.
-- Aditiva, sem reset do banco de dev.

CREATE TABLE "vista_coordenacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "camera" JSONB NOT NULL,
    "modelosVisiveis" JSONB NOT NULL,
    "corte" JSONB,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "vista_coordenacao_projetoId_idx" ON "vista_coordenacao"("projetoId");
