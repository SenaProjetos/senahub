-- CRM Fase 2 (F2.5, ADR-02 + ADR-18): uma prospecção ATIVA por empresa + campanha.
--
-- ⚠️ CORRIGIDA EM 2026-08-21, DEPOIS DE FALHAR EM PRODUÇÃO (P3018 / 23505).
--
-- A versão original criava DOIS índices. O segundo — `lead_prospeccao_ativa_sem_campanha_unica`
-- — abortou o deploy: `Zaphis Inc LTDA` tem TRÊS prospecções ativas sem campanha
-- (EDIF. ARAPIRACA, EDIF. ISA BEACH, EDIF. BELA BEACH).
--
-- Não é dado sujo: são três obras reais e simultâneas. E a origem da colisão é a própria F1.15 —
-- antes da fusão esses leads apontavam para três registros de cliente distintos, e só passaram a
-- dividir a mesma empresa depois que o grupo Záphis foi consolidado. A fusão criou a violação.
--
-- Ou seja, **o dado de produção refuta o ADR-02** na parte "sem campanha". O ADR-18 já havia
-- registrado que "múltiplas obras por cliente é o padrão do escritório", mas resolveu isso
-- liberando os status TERMINAIS — não previu várias obras ATIVAS ao mesmo tempo, que é o caso real.
--
-- O índice de campanha preenchida FICA: ele expressa a parte da regra que se sustenta (não abrir
-- duas prospecções para a mesma empresa DENTRO da mesma campanha). O índice "sem campanha" sai
-- até que a regra seja revista com o dono — e, se voltar, tem de vir DEPOIS da F2.18, que é quem
-- organiza os leads. É a mesma lição da Fase 1, onde o índice único da F1.16 veio depois da
-- limpeza da F1.15; eu escrevi esse aviso aqui embaixo e ainda assim mirei só na F2.18.
--
-- `IF NOT EXISTS` no que restou: em produção o primeiro índice JÁ foi criado antes da falha (a
-- migration não é atômica), então a reaplicação precisa ser inofensiva.
--
-- Não está no `schema.prisma`: o Prisma não expressa índice parcial. Mesmo padrão de SQL cru do
-- `cliente_documento_unico` (F1.16) e dos índices GIN de `20260621201500_search_indexes`.
--
-- ── Por que só o índice de campanha preenchida ────────────────────────────────────────────────
-- Em Postgres, `NULL <> NULL`, então este índice cobre exclusivamente o caso em que a campanha
-- está preenchida. O caso "sem campanha" exigiria um segundo índice sobre `(clienteId)` — que foi
-- tentado, falhou contra o dado real, e está descrito no aviso do topo.
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
