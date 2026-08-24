-- M8: fase de documento passa a ser opcional por padrão, mas configurável por projeto.
-- O DEFAULT preserva o comportamento dos projetos existentes e dispensa backfill.
ALTER TABLE "nomenclatura_config" ADD COLUMN "exigirFase" BOOLEAN NOT NULL DEFAULT false;
