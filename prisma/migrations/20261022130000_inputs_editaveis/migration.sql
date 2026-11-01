-- Perguntas extras: origem no padrão + remoção reversível.
ALTER TABLE "input_projeto" ADD COLUMN "templateId" TEXT;
ALTER TABLE "input_projeto" ADD COLUMN "removidoEm" TIMESTAMP(3);
CREATE INDEX "input_projeto_templateId_idx" ON "input_projeto"("templateId");
ALTER TABLE "input_projeto" ADD CONSTRAINT "input_projeto_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "input_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Briefing: seções e campos ocultos por projeto.
ALTER TABLE "briefing_projeto" ADD COLUMN "secoesOcultas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "briefing_projeto" ADD COLUMN "camposOcultos" TEXT[] DEFAULT ARRAY[]::TEXT[];
