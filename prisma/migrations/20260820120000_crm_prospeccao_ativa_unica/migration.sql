-- CRM Fase 2 (F2.5, ADR-02 + ADR-18): uma prospecção ATIVA por empresa + campanha.
--
-- Não está no `schema.prisma`: o Prisma não expressa índice parcial. Mesmo padrão de SQL cru do
-- `cliente_documento_unico` (F1.16) e dos índices GIN de `20260621201500_search_indexes`.
--
-- ── Por que DOIS índices, e não um ────────────────────────────────────────────────────────────
-- Em Postgres, `NULL <> NULL`. Um único índice em `(clienteId, campaignId)` NÃO pegaria duas
-- prospecções abertas da mesma empresa **sem campanha** — que é justamente o caso mais comum
-- (hoje nenhum lead de produção tem campanha) e o que o aceite da F2.5 exige recusar. Por isso:
--   1. `..._campanha_unica`      → (clienteId, campaignId), só quando campanha está preenchida;
--   2. `..._sem_campanha_unica`  → (clienteId), só quando campanha é NULL.
-- Juntos cobrem os dois casos sem depender da semântica de NULL.
--
-- ── O predicado ───────────────────────────────────────────────────────────────────────────────
-- Os 4 status listados são os que TRAVAM a empresa (ADR-18), e são exatamente os mesmos de
-- `STATUS_PROSPECCAO_ATIVOS` em `src/modules/comercial/prospeccao.ts` — há um teste que compara
-- esta lista com aquela constante, para as duas pontas não divergirem em silêncio.
-- `OPORTUNIDADE_CRIADA`, `SEM_OPORTUNIDADE`, `EM_ESPERA` e `DESCARTADO` LIBERAM: decidido com dado
-- real, porque múltiplas obras por cliente é o padrão do escritório (Záphis 3×, Rbarros 2×).
--
-- `excluidoEm IS NULL`: prospecção logicamente excluída não pode seguir travando a empresa.
-- Diferente do `cliente_documento_unico`, que deliberadamente NÃO exclui — lá o valor é um
-- documento fiscal que continua pertencendo a alguém; aqui é um registro de trabalho.
--
-- `clienteId IS NOT NULL`: a coluna é nullable por ora (ver F2.3 — os 8 leads reais têm
-- `clienteId` nulo porque `criarLead` nunca preencheu). Sem prospecção ancorada em empresa não há
-- o que travar. É também o que faz este CREATE INDEX passar sem conflito no estado atual.
--
-- ⚠️ AVISO PARA A F2.18 (migração dos 8 leads em produção): a partir daqui, preencher `clienteId`
-- à mão pode ESBARRAR nestes índices — Záphis tem 3 leads e Rbarros 2, e se dois deles receberem
-- a mesma empresa mantendo status ativo e sem campanha, o segundo UPDATE é recusado. Isso é a
-- regra funcionando, não um bug: cabe a quem migrar decidir o status real de cada um (vários já
-- deveriam estar em OPORTUNIDADE_CRIADA ou DESCARTADO) ou separá-los por campanha.

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS lead_prospeccao_ativa_campanha_unica
  ON "lead" ("clienteId", "campaignId")
  WHERE "excluidoEm" IS NULL
    AND "clienteId" IS NOT NULL
    AND "campaignId" IS NOT NULL
    AND "status" IN ('IDENTIFICADO', 'CONTATO_INICIADO', 'EM_CONTATO', 'QUALIFICADO');

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS lead_prospeccao_ativa_sem_campanha_unica
  ON "lead" ("clienteId")
  WHERE "excluidoEm" IS NULL
    AND "clienteId" IS NOT NULL
    AND "campaignId" IS NULL
    AND "status" IN ('IDENTIFICADO', 'CONTATO_INICIADO', 'EM_CONTATO', 'QUALIFICADO');
