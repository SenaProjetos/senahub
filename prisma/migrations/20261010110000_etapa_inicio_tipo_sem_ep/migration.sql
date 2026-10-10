-- Card da disciplina com início e fim por etapa (áudio do dono, 2026-10-10).
ALTER TABLE "disciplina_etapa" ADD COLUMN "inicio" DATE;

-- Tipo de empreendimento sem Estudo Preliminar: o projeto nasce só com Básico e Executivo.
ALTER TABLE "tipo_empreendimento" ADD COLUMN "semEstudoPreliminar" BOOLEAN NOT NULL DEFAULT false;
UPDATE "tipo_empreendimento" SET "semEstudoPreliminar" = true WHERE "nome" ILIKE '%unifamiliar%';
