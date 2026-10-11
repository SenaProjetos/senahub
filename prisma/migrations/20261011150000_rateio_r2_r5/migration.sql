-- Rateio de horas R2 a R5 (spec docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md, decisões
-- 10–27). Tudo aditivo; a única mudança de dado existente é a normalização do papel do membro (R5) e a
-- troca da categoria do compromisso recorrente da folha para a subcategoria Salários (R4).

-- ============================== R2 — ponto ==============================
ALTER TABLE "batida" ADD COLUMN "tipoAlocacao" "TipoAlocacaoPonto";

ALTER TABLE "sessao_trabalho" ADD COLUMN "disciplinaId" TEXT;
CREATE INDEX "sessao_trabalho_disciplinaId_idx" ON "sessao_trabalho"("disciplinaId");
ALTER TABLE "sessao_trabalho" ADD CONSTRAINT "sessao_trabalho_disciplinaId_fkey"
  FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rateio_hora" ADD COLUMN "disciplinaId" TEXT;
CREATE INDEX "rateio_hora_disciplinaId_idx" ON "rateio_hora"("disciplinaId");
ALTER TABLE "rateio_hora" ADD CONSTRAINT "rateio_hora_disciplinaId_fkey"
  FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A linha do rateio passa a ser pessoa × mês × natureza × projeto × disciplina. Um índice único por
-- expressão (COALESCE dos nulos) troca os dois parciais da R1.
DROP INDEX IF EXISTS "rateio_hora_linha_projeto_key";
DROP INDEX IF EXISTS "rateio_hora_linha_sem_projeto_key";
CREATE UNIQUE INDEX "rateio_hora_linha_key" ON "rateio_hora"(
  "userId", "ano", "mes", "natureza", COALESCE("projetoId", ''), COALESCE("disciplinaId", '')
);

-- ============================== R3 — fechamento ==============================
ALTER TABLE "fechamento_rateio" ADD COLUMN "custoTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
UPDATE "fechamento_rateio" f
SET "custoTotal" = COALESCE((SELECT SUM(r."custo") FROM "rateio_hora" r WHERE r."ano" = f."ano" AND r."mes" = f."mes"), 0);

CREATE TABLE "fechamento_rateio_evento" (
  "id" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "motivo" TEXT,
  "calculo" TEXT,
  "custoTotal" DECIMAL(14,2),
  "autorId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fechamento_rateio_evento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fechamento_rateio_evento_ano_mes_idx" ON "fechamento_rateio_evento"("ano", "mes");
CREATE INDEX "fechamento_rateio_evento_autorId_idx" ON "fechamento_rateio_evento"("autorId");
ALTER TABLE "fechamento_rateio_evento" ADD CONSTRAINT "fechamento_rateio_evento_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Os fechamentos existentes ganham o evento de origem.
INSERT INTO "fechamento_rateio_evento" ("id", "ano", "mes", "tipo", "calculo", "custoTotal", "autorId", "criadoEm")
SELECT 'fre_' || f."id", f."ano", f."mes", 'fechou', f."calculo", f."custoTotal", f."fechadoPorId", f."fechadoEm"
FROM "fechamento_rateio" f;

-- ============================== R4 — folha no financeiro ==============================
ALTER TABLE "folha_pagamento" ADD COLUMN "totalInssRetido" DECIMAL(12,2);
ALTER TABLE "folha_pagamento" ADD COLUMN "totalIrrfRetido" DECIMAL(12,2);
ALTER TABLE "folha_pagamento" ADD COLUMN "totalFgts" DECIMAL(12,2);

CREATE TABLE "holerite_versao" (
  "id" TEXT NOT NULL,
  "holeriteId" TEXT NOT NULL,
  "itens" JSONB NOT NULL,
  "assinadoEm" TIMESTAMP(3) NOT NULL,
  "assinanteId" TEXT,
  "motivo" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "holerite_versao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "holerite_versao_holeriteId_idx" ON "holerite_versao"("holeriteId");
ALTER TABLE "holerite_versao" ADD CONSTRAINT "holerite_versao_holeriteId_fkey"
  FOREIGN KEY ("holeriteId") REFERENCES "holerite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "folha_reabertura" (
  "id" TEXT NOT NULL,
  "folhaId" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "autorId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folha_reabertura_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "folha_reabertura_folhaId_idx" ON "folha_reabertura"("folhaId");
CREATE INDEX "folha_reabertura_autorId_idx" ON "folha_reabertura"("autorId");
ALTER TABLE "folha_reabertura" ADD CONSTRAINT "folha_reabertura_folhaId_fkey"
  FOREIGN KEY ("folhaId") REFERENCES "folha_pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folha_reabertura" ADD CONSTRAINT "folha_reabertura_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "ParteFolha" AS ENUM ('bolsa', 'inss_retido', 'irrf_retido', 'fgts', 'beneficio');
CREATE TABLE "folha_lancamento" (
  "id" TEXT NOT NULL,
  "folhaId" TEXT NOT NULL,
  "parte" "ParteFolha" NOT NULL,
  "rotulo" TEXT NOT NULL DEFAULT '',
  "lancamentoId" TEXT NOT NULL,
  CONSTRAINT "folha_lancamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "folha_lancamento_lancamentoId_key" ON "folha_lancamento"("lancamentoId");
CREATE UNIQUE INDEX "folha_lancamento_folhaId_parte_rotulo_key" ON "folha_lancamento"("folhaId", "parte", "rotulo");
ALTER TABLE "folha_lancamento" ADD CONSTRAINT "folha_lancamento_folhaId_fkey"
  FOREIGN KEY ("folhaId") REFERENCES "folha_pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Subcategorias da folha (decisão 22), achadas pela CHAVE. Se o código já existir no plano do
-- usuário, a linha não entra (ON CONFLICT) e o código cai para a categoria-mãe — nunca quebra.
INSERT INTO "categoria_financeira" ("id", "codigo", "chave", "nome", "tipo", "paiId", "ordem", "ativo", "prioridadePadrao", "natureza")
SELECT v.id, v.codigo, v.chave, v.nome, 'despesa', pai."id", v.ordem, true, v.prioridade::"PrioridadePagamento", 'resultado'
FROM (VALUES
  ('cat_folha_salarios',  '2.03.01', 'despesa_folha_salarios',        'Salários',                  1, 'p1', 'despesa_folha_clt'),
  ('cat_folha_fgts',      '2.03.02', 'despesa_folha_fgts',            'FGTS',                      2, 'p1', 'despesa_folha_clt'),
  ('cat_folha_13',        '2.03.03', 'despesa_folha_decimo_terceiro', '13º salário',               3, 'p1', 'despesa_folha_clt'),
  ('cat_folha_ferias',    '2.03.04', 'despesa_folha_ferias',          'Férias',                    4, 'p1', 'despesa_folha_clt'),
  ('cat_folha_rescisoes', '2.03.05', 'despesa_folha_rescisoes',       'Rescisões e aviso prévio',  5, 'p1', 'despesa_folha_clt'),
  ('cat_folha_vt',        '2.03.06', 'despesa_folha_vale_transporte', 'Vale-transporte',           6, 'p2', 'despesa_folha_clt'),
  ('cat_folha_vr',        '2.03.07', 'despesa_folha_vale_refeicao',   'Vale-refeição',             7, 'p2', 'despesa_folha_clt'),
  ('cat_estagio_bolsa',   '2.04.01', 'despesa_estagio_bolsa',         'Bolsa',                     1, 'p2', 'despesa_estagiarios'),
  ('cat_estagio_agente',  '2.04.02', 'despesa_estagio_taxa_agente',   'Taxa do agente (IEL)',      2, 'p3', 'despesa_estagiarios')
) AS v(id, codigo, chave, nome, ordem, prioridade, chavePai)
JOIN "categoria_financeira" pai ON pai."chave" = v.chavePai
ON CONFLICT DO NOTHING;

-- O compromisso recorrente da folha (e o do adiantamento) passa a gerar a conta em Salários. As contas
-- já geradas ficam na categoria-mãe (histórico); o fechamento procura nas duas.
UPDATE "compromisso_recorrente" c
SET "categoriaId" = sal."id"
FROM "categoria_financeira" mae, "categoria_financeira" sal
WHERE mae."chave" = 'despesa_folha_clt' AND sal."chave" = 'despesa_folha_salarios'
  AND c."categoriaId" = mae."id";

-- ============================== R5 — papel e histórico de responsáveis ==============================
-- Papel do membro em lista fixa (decisão 25): coordenador, projetista, apoio, estagiario,
-- consultor_externo. Texto que não casa com nenhum vira NULL (a tela mostra "Sem papel").
UPDATE "projeto_membro" SET "papel" = CASE
  WHEN "papel" IS NULL OR btrim("papel") = '' THEN NULL
  WHEN lower("papel") LIKE '%coord%' THEN 'coordenador'
  WHEN lower("papel") LIKE '%consult%' OR lower("papel") LIKE '%extern%' THEN 'consultor_externo'
  WHEN lower("papel") LIKE '%estag%' THEN 'estagiario'
  WHEN lower("papel") LIKE '%apoio%' OR lower("papel") LIKE '%auxil%' THEN 'apoio'
  WHEN lower("papel") LIKE '%projet%' OR lower("papel") LIKE '%arquit%' OR lower("papel") LIKE '%engenh%' OR lower("papel") LIKE '%desenh%' THEN 'projetista'
  ELSE NULL
END;

CREATE TABLE "disciplina_responsavel_historico" (
  "id" TEXT NOT NULL,
  "disciplinaId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "inicio" TIMESTAMP(3) NOT NULL,
  "fim" TIMESTAMP(3),
  CONSTRAINT "disciplina_responsavel_historico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "disciplina_responsavel_historico_disciplinaId_inicio_idx" ON "disciplina_responsavel_historico"("disciplinaId", "inicio");
CREATE INDEX "disciplina_responsavel_historico_userId_idx" ON "disciplina_responsavel_historico"("userId");
ALTER TABLE "disciplina_responsavel_historico" ADD CONSTRAINT "disciplina_responsavel_historico_disciplinaId_fkey"
  FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disciplina_responsavel_historico" ADD CONSTRAINT "disciplina_responsavel_historico_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Carga inicial: quem é responsável hoje, desde a criação da disciplina (não há registro anterior).
INSERT INTO "disciplina_responsavel_historico" ("id", "disciplinaId", "userId", "inicio")
SELECT 'drh_' || dr."id", dr."disciplinaId", dr."userId", d."createdAt"
FROM "disciplina_responsavel" dr
JOIN "disciplina" d ON d."id" = dr."disciplinaId";
