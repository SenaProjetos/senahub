-- Item 9: marcação vetorial do apontamento (retângulo, seta, nuvem de revisão) além do pino.
-- Ambas nullable e sem backfill: linha existente = pino simples, que é o comportamento de
-- sempre. `marcacaoGeo` guarda OFFSETS relativos a (x,y), não coordenada absoluta — ver
-- src/modules/projetos/pendencias/marcacao.ts.

ALTER TABLE "pendencia" ADD COLUMN "marcacaoTipo" TEXT;
ALTER TABLE "pendencia" ADD COLUMN "marcacaoGeo" JSONB;
