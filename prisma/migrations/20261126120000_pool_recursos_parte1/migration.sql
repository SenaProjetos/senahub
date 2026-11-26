-- Pool de recursos, parte 1: cor do projeto, dedicação por disciplina e horas automáticas.
ALTER TABLE "projeto" ADD COLUMN "cor" TEXT;
ALTER TABLE "disciplina_responsavel" ADD COLUMN "dedicacao" INTEGER;
ALTER TABLE "disciplina_responsavel" ADD CONSTRAINT "disciplina_responsavel_dedicacao_faixa" CHECK ("dedicacao" IS NULL OR ("dedicacao" >= 1 AND "dedicacao" <= 100));
ALTER TABLE "eap_atribuicao" ADD COLUMN "horasAutomaticas" BOOLEAN NOT NULL DEFAULT false;
