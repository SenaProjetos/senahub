-- Gestão de Pessoas F2: competência com nível, catálogo proposto/publicado e necessidade por projeto.
-- Aditiva: vínculos existentes ficam com nível "não informado" (nulo) — nenhum nível é inventado.

ALTER TABLE "habilidade" ADD COLUMN "categoria" TEXT,
ADD COLUMN "publicada" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "propostaPorId" TEXT;

ALTER TABLE "user_habilidade" ADD COLUMN "nivel" INTEGER,
ADD COLUMN "observacao" TEXT,
ADD COLUMN "declaradoEm" TIMESTAMP(3),
ADD COLUMN "validadoEm" TIMESTAMP(3),
ADD COLUMN "validadoPorId" TEXT;

ALTER TABLE "user_habilidade" ADD CONSTRAINT "user_habilidade_nivel_faixa" CHECK ("nivel" IS NULL OR ("nivel" BETWEEN 1 AND 5));

CREATE TABLE "necessidade_habilidade" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "habilidadeId" TEXT NOT NULL,
    "nivelMinimo" INTEGER NOT NULL DEFAULT 3,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "necessidade_habilidade_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "necessidade_habilidade_nivel_faixa" CHECK ("nivelMinimo" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "necessidade_habilidade_projetoId_habilidadeId_key" ON "necessidade_habilidade"("projetoId", "habilidadeId");
CREATE INDEX "necessidade_habilidade_habilidadeId_idx" ON "necessidade_habilidade"("habilidadeId");

ALTER TABLE "necessidade_habilidade" ADD CONSTRAINT "necessidade_habilidade_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "necessidade_habilidade" ADD CONSTRAINT "necessidade_habilidade_habilidadeId_fkey" FOREIGN KEY ("habilidadeId") REFERENCES "habilidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
