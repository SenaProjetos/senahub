-- C4 (integração contábil): retenções na nota. A retenção mora no título; na baixa vira acessório fora da DRE na conta do
-- pagamento e, na conta a pagar, uma conta de imposto retido a recolher (spec 2026-10-07-integracao-contabil §7, mock C4).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ImpostoRetido" AS ENUM ('iss', 'irrf', 'inss', 'pis', 'cofins', 'csll');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: conta de imposto gerada pela retenção (e acessório da retenção) — escalares, sem FK de propósito.
ALTER TABLE "lancamento" ADD COLUMN IF NOT EXISTS "retencaoDeId" TEXT,
ADD COLUMN IF NOT EXISTS "retencaoImposto" "ImpostoRetido";
CREATE INDEX IF NOT EXISTS "lancamento_retencaoDeId_idx" ON "lancamento"("retencaoDeId");
-- Defesa em profundidade (fora do schema.prisma, como os índices parciais do RH): um imposto por nota, vivo, tanto na
-- conta a recolher quanto no acessório da baixa. Um caminho novo que reaplicasse a retenção esbarra aqui em vez de
-- duplicar o imposto no caixa e no arquivo do contador.
CREATE UNIQUE INDEX IF NOT EXISTS "lancamento_retencao_conta_unica" ON "lancamento"("retencaoDeId", "retencaoImposto")
  WHERE "excluidoEm" IS NULL AND "retencaoDeId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "lancamento_retencao_acessorio_unico" ON "lancamento"("acessorioDeId", "retencaoImposto")
  WHERE "excluidoEm" IS NULL AND "acessorioDeId" IS NOT NULL AND "retencaoImposto" IS NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "lancamento_retencao" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "imposto" "ImpostoRetido" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "lancamento_retencao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "lancamento_retencao_lancamentoId_imposto_key" ON "lancamento_retencao"("lancamentoId", "imposto");
DO $$ BEGIN
  ALTER TABLE "lancamento_retencao" ADD CONSTRAINT "lancamento_retencao_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Categorias do sistema (por chave), FORA DO RESULTADO: mexem no caixa, nunca na DRE (a despesa/receita já entrou pelo
-- valor cheio da nota). Debaixo de Receitas/Despesas da semente, no próximo código livre. Sem a raiz (banco NOVO: as
-- migrations rodam antes do seed) não cria nada — o seed as garante pela chave depois (`prisma/seed.ts`, 4b).
DO $$
DECLARE
  r record;
  v_pai text;
  v_codpai text;
  v_n int;
  v_cod text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('receita', 'receita_retencao_feita', 'Retenção feita na nota (a recolher)', 196, NULL),
    ('despesa', 'despesa_retencao_sofrida', 'Retenção sofrida na nota (a compensar)', 296, NULL),
    -- Imposto a pagar: P1 no planejador, como "Impostos" (2.07).
    ('despesa', 'despesa_imposto_retido_a_recolher', 'Impostos retidos a recolher', 297, 'p1')
  ) AS t(raiz, chave, nome, ordem, prioridade) LOOP
    IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = r.chave) THEN
      v_pai := NULL;
      SELECT "id", "codigo" INTO v_pai, v_codpai FROM "categoria_financeira" WHERE "chave" = r.raiz LIMIT 1;
      IF v_pai IS NOT NULL THEN
        v_n := 1;
        LOOP
          v_cod := v_codpai || '.' || lpad(v_n::text, 2, '0');
          EXIT WHEN NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "codigo" = v_cod);
          v_n := v_n + 1;
        END LOOP;
        INSERT INTO "categoria_financeira" ("id", "codigo", "chave", "nome", "tipo", "natureza", "paiId", "ordem", "ativo", "prioridadePadrao")
        VALUES (gen_random_uuid()::text, v_cod, r.chave, r.nome, r.raiz::"TipoCategoria", 'fora_do_resultado', v_pai, r.ordem, true,
                r.prioridade::"PrioridadePagamento");
      END IF;
    END IF;
  END LOOP;
END $$;

-- De-para sugerido (plano do contador, 2026-10): impostos retidos a recolher. ISS a recolher e as contas "a compensar" não
-- existem no plano dele — ficam como pendência na tela até ele criar.
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt") VALUES
  (gen_random_uuid()::text, 'imposto_recolher', 'irrf', 2163, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_recolher', 'inss', 2254, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_recolher', 'pis', 2177, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_recolher', 'cofins', 2184, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_recolher', 'csll', 2170, false, CURRENT_TIMESTAMP)
ON CONFLICT ("alvo", "alvoId") DO NOTHING;
