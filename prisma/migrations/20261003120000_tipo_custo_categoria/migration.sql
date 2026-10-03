-- Ponto de equilíbrio por margem de contribuição (decisão do dono, 2026-10-03): cada categoria de despesa é custo
-- fixo ou variável. Coluna anulável (nulo = herda da mãe; sem nada na cadeia = fixo), sem efeito em nenhuma outra tela.

-- CreateEnum
CREATE TYPE "TipoCusto" AS ENUM ('fixo', 'variavel');

-- AlterTable
ALTER TABLE "categoria_financeira" ADD COLUMN "tipoCusto" "TipoCusto";

-- Categorias do sistema, pela chave (o código é editável). Só onde ainda está nulo: rodar de novo não desfaz ajuste.
-- A raiz "Despesas" é fixa e as filhas sem marcação herdam (folha, estagiários, administrativas, pró-labore…).
UPDATE "categoria_financeira" SET "tipoCusto" = 'fixo'::"TipoCusto"
WHERE "chave" = 'despesa' AND "tipoCusto" IS NULL;

-- Acompanham o faturamento.
UPDATE "categoria_financeira" SET "tipoCusto" = 'variavel'::"TipoCusto"
WHERE "chave" IN (
  'despesa_projetistas_pj',
  'despesa_freelancers',
  'despesa_fornecedores',
  'despesa_art_rrt',
  'despesa_impostos',
  'despesa_descontos_concedidos'
) AND "tipoCusto" IS NULL;
