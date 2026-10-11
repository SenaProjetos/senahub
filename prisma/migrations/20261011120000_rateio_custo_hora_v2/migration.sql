-- Rateio de horas R1 (spec docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md).

-- Linhas do rateio: projeto opcional (linha "não alocado"), natureza e contratação do mês.
CREATE TYPE "NaturezaRateio" AS ENUM ('projeto', 'reuniao', 'nao_alocado');
ALTER TABLE "rateio_hora" ADD COLUMN "natureza" "NaturezaRateio" NOT NULL DEFAULT 'projeto';
ALTER TABLE "rateio_hora" ADD COLUMN "contratacao" "Contratacao";
ALTER TABLE "rateio_hora" ALTER COLUMN "projetoId" DROP NOT NULL;
DROP INDEX IF EXISTS "rateio_hora_userId_projetoId_ano_mes_key";
CREATE INDEX "rateio_hora_ano_mes_idx" ON "rateio_hora"("ano", "mes");
-- O unique antigo era o único índice que começava por userId (cascata e leituras por pessoa).
CREATE INDEX "rateio_hora_userId_ano_mes_idx" ON "rateio_hora"("userId", "ano", "mes");
-- Uma linha por pessoa × mês × natureza × projeto (a linha "não alocado" tem projetoId nulo).
-- Parciais, fora do schema.prisma; as linhas antigas são todas natureza=projeto e já eram únicas.
CREATE UNIQUE INDEX "rateio_hora_linha_projeto_key" ON "rateio_hora"("userId", "ano", "mes", "natureza", "projetoId") WHERE "projetoId" IS NOT NULL;
CREATE UNIQUE INDEX "rateio_hora_linha_sem_projeto_key" ON "rateio_hora"("userId", "ano", "mes", "natureza") WHERE "projetoId" IS NULL;
UPDATE "rateio_hora" r SET "contratacao" = u."contratacao" FROM "user" u WHERE u."id" = r."userId";

-- Cabeçalho do fechamento; os meses já fechados viram "legado".
CREATE TABLE "fechamento_rateio" (
  "id" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "calculo" TEXT NOT NULL,
  "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechadoPorId" TEXT,
  CONSTRAINT "fechamento_rateio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fechamento_rateio_ano_mes_key" ON "fechamento_rateio"("ano", "mes");
CREATE INDEX "fechamento_rateio_fechadoPorId_idx" ON "fechamento_rateio"("fechadoPorId");
ALTER TABLE "fechamento_rateio" ADD CONSTRAINT "fechamento_rateio_fechadoPorId_fkey"
  FOREIGN KEY ("fechadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "fechamento_rateio" ("id", "ano", "mes", "calculo", "fechadoEm")
SELECT 'fr_' || "ano" || '_' || "mes", "ano", "mes", 'legado', MAX("fechadoEm")
FROM "rateio_hora" GROUP BY "ano", "mes";

-- Tabela de encargos versionada + versão inicial (respostas de 10/10/2026).
CREATE TABLE "tabela_encargos" (
  "id" TEXT NOT NULL,
  "contratacao" "Contratacao" NOT NULL,
  "vigenciaEm" DATE NOT NULL,
  "parametros" JSONB NOT NULL,
  "observacao" TEXT,
  "autorId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tabela_encargos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tabela_encargos_contratacao_vigenciaEm_key" ON "tabela_encargos"("contratacao", "vigenciaEm");
CREATE INDEX "tabela_encargos_autorId_idx" ON "tabela_encargos"("autorId");
ALTER TABLE "tabela_encargos" ADD CONSTRAINT "tabela_encargos_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "tabela_encargos" ("id", "contratacao", "vigenciaEm", "parametros", "observacao") VALUES
  ('te_clt_202610', 'clt', '2026-10-01',
   '{"tipo":"clt","fgtsBp":800,"multaFgtsBp":4000,"inssEmpresaBp":0,"reservaDecimoTerceiro":true,"reservaFerias":true,"reservaAvisoPrevio":true,"beneficios":[{"nome":"Vale-transporte","valorCent":20000,"suspensoNasFerias":true},{"nome":"Vale-refeição","valorCent":55000,"suspensoNasFerias":true}]}',
   'Versão inicial — decisões de 10/10/2026'),
  ('te_estagio_202610', 'estagio', '2026-10-01',
   '{"tipo":"estagio","reservaRecesso":true,"taxaAgenteCent":8500}',
   'Versão inicial — decisões de 10/10/2026'),
  ('te_prolabore_202610', 'pro_labore', '2026-10-01',
   '{"tipo":"pro_labore","inssEmpresaBp":0}',
   'Versão inicial — decisões de 10/10/2026');

-- Agente de integração do estágio: hoje todos os estagiários ativos são pelo IEL.
ALTER TABLE "vinculo" ADD COLUMN "agenteIntegracao" TEXT;
UPDATE "vinculo" SET "agenteIntegracao" = 'IEL' WHERE "contratacao" = 'estagio' AND "ativo" = true;

-- Corte do cálculo novo (decisão 8).
INSERT INTO "config_sistema" ("chave", "valor", "updatedAt")
VALUES ('rh.rateio.calculoNovoDesde', '"2026-10"'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("chave") DO NOTHING;
