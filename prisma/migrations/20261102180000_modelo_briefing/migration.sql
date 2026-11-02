-- Lote 4 (2026-11-02): modelos de formulário do briefing (editor estilo Google Forms).
-- Tabela nova + escolha opcional por projeto. Sem backfill: modeloId nulo = modelo padrão, que o
-- `db:seed` cria a partir do formulário embutido (e o código usa o embutido até o seed rodar).
CREATE TABLE "modelo_briefing" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "esquema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_briefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modelo_briefing_nome_key" ON "modelo_briefing"("nome");
-- No máximo UM modelo padrão (índice parcial; o Prisma não o descreve).
CREATE UNIQUE INDEX "modelo_briefing_um_padrao" ON "modelo_briefing"("padrao") WHERE "padrao" = true;

ALTER TABLE "briefing_projeto" ADD COLUMN "modeloId" TEXT;
CREATE INDEX "briefing_projeto_modeloId_idx" ON "briefing_projeto"("modeloId");
ALTER TABLE "briefing_projeto" ADD CONSTRAINT "briefing_projeto_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelo_briefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
