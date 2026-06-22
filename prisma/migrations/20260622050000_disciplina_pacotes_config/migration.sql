-- P-13: configuração de pacotes obrigatórios por disciplina.
-- Pranchas e arquivos (A) e Backup do modelo (B) são obrigatórios por padrão.
ALTER TABLE "disciplina" ADD COLUMN "exigePacoteA" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "disciplina" ADD COLUMN "exigePacoteB" BOOLEAN NOT NULL DEFAULT true;
