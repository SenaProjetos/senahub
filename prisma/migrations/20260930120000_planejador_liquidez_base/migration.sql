-- Planejador de caixa — migração A (F0). Spec: docs/superpowers/specs/2026-09-30-planejador-financeiro.md
-- ADRs: 0007 (confiança ≠ realizado), 0008 (natureza da categoria e transferência).
-- Só acrescenta: colunas anuláveis ou com DEFAULT, índices e backfill idempotente. Nenhum DROP.

-- 1) Enums novos
CREATE TYPE "PrioridadePagamento" AS ENUM ('p1', 'p2', 'p3', 'p4');
CREATE TYPE "ConfiancaRecebimento" AS ENUM ('confirmada_cliente', 'provavel', 'estimada', 'incerta');
CREATE TYPE "NaturezaCategoria" AS ENUM ('resultado', 'fora_do_resultado', 'transferencia');

-- 2) Plano de contas: chave estável, prioridade herdada e natureza
ALTER TABLE "categoria_financeira"
  ADD COLUMN "chave" TEXT,
  ADD COLUMN "prioridadePadrao" "PrioridadePagamento",
  ADD COLUMN "natureza" "NaturezaCategoria" NOT NULL DEFAULT 'resultado';
CREATE UNIQUE INDEX "categoria_financeira_chave_key" ON "categoria_financeira"("chave");

-- 3) Lançamento: prioridade (despesa), confiança (receita pendente) e par de transferência
ALTER TABLE "lancamento"
  ADD COLUMN "prioridade" "PrioridadePagamento",
  ADD COLUMN "confianca" "ConfiancaRecebimento",
  ADD COLUMN "transferenciaId" TEXT;
CREATE INDEX "lancamento_transferenciaId_idx" ON "lancamento"("transferenciaId");

-- 4) Backfill da chave nas categorias da semente (prisma/seed.ts → PLANO_CONTAS).
-- Só onde o código E o tipo batem com a semente e a chave ainda não foi usada: o código é editável
-- e o import cria "3", "3.01"…; uma categoria renomeada/recodificada fica sem chave (e o código
-- que depende dela avisa), em vez de ganhar a chave errada.
UPDATE "categoria_financeira" c
SET "chave" = v.chave
FROM (VALUES
  ('1',    'receita', 'receita'),
  ('1.01', 'receita', 'receita_projetos_particulares'),
  ('1.02', 'receita', 'receita_licitacoes'),
  ('1.03', 'receita', 'receita_outras'),
  ('2',    'despesa', 'despesa'),
  ('2.01', 'despesa', 'despesa_projetistas_pj'),
  ('2.02', 'despesa', 'despesa_freelancers'),
  ('2.03', 'despesa', 'despesa_folha_clt'),
  ('2.04', 'despesa', 'despesa_estagiarios'),
  ('2.05', 'despesa', 'despesa_fornecedores'),
  ('2.06', 'despesa', 'despesa_administrativas'),
  ('2.07', 'despesa', 'despesa_impostos'),
  ('2.08', 'despesa', 'despesa_pro_labore'),
  ('2.09', 'despesa', 'despesa_art_rrt')
) AS v(codigo, tipo, chave)
WHERE c."codigo" = v.codigo
  AND c."tipo"::text = v.tipo
  AND c."chave" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "categoria_financeira" x WHERE x."chave" = v.chave);

-- 5) Prioridade padrão por chave (decisão D3 do dono). Só onde ainda está nula.
UPDATE "categoria_financeira" c
SET "prioridadePadrao" = v.prioridade::"PrioridadePagamento"
FROM (VALUES
  ('despesa_folha_clt',       'p1'),
  ('despesa_impostos',        'p1'),
  ('despesa_projetistas_pj',  'p2'),
  ('despesa_freelancers',     'p2'),
  ('despesa_estagiarios',     'p2'),
  ('despesa_pro_labore',      'p2'),
  ('despesa_fornecedores',    'p3'),
  ('despesa_administrativas', 'p3'),
  ('despesa_art_rrt',         'p3')
) AS v(chave, prioridade)
WHERE c."chave" = v.chave
  AND c."prioridadePadrao" IS NULL;

-- 6) Natureza de transferência: as categorias que o import do Meu Dinheiro cria com esse nome
-- (uma por tipo) e as filhas delas.
UPDATE "categoria_financeira"
SET "natureza" = 'transferencia'
WHERE lower(btrim("nome")) IN ('transferência', 'transferencia', 'transferências', 'transferencias')
   OR "paiId" IN (
     SELECT "id" FROM "categoria_financeira"
     WHERE lower(btrim("nome")) IN ('transferência', 'transferencia', 'transferências', 'transferencias')
   );

-- 7) Pareamento das pernas importadas: o import grava `importHash` = <base>:out / <base>:in.
-- Inclui linhas logicamente excluídas (excluidoEm) de propósito: o par é propriedade do dado, e o
-- motor ignora pernas excluídas ao procurar contraparte.
UPDATE "lancamento" l
SET "transferenciaId" = regexp_replace(l."importHash", ':(out|in)$', '')
FROM "categoria_financeira" c
WHERE l."categoriaId" = c."id"
  AND c."natureza" = 'transferencia'
  AND l."transferenciaId" IS NULL
  AND l."importHash" ~ ':(out|in)$';
