-- M4 (Financeiro): carteira de investimentos. Cada ativo é dono de uma conta bancária (tipo investimento) que fica
-- fora do caixa; aporte/resgate são transferências, rendimento é receita e IR é despesa na conta do ativo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoInvestimento') THEN
    CREATE TYPE "TipoInvestimento" AS ENUM ('cdb', 'lci', 'lca', 'tesouro', 'fundo', 'poupanca', 'debenture', 'outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiquidezInvestimento') THEN
    CREATE TYPE "LiquidezInvestimento" AS ENUM ('diaria', 'd1', 'vencimento', 'outra');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "investimento" (
  "id"            TEXT NOT NULL,
  "nome"          TEXT NOT NULL,
  "tipo"          "TipoInvestimento" NOT NULL DEFAULT 'cdb',
  "instituicao"   TEXT,
  "indexador"     TEXT,
  "liquidez"      "LiquidezInvestimento" NOT NULL DEFAULT 'vencimento',
  "vencimento"    DATE,
  "isentoIR"      BOOLEAN NOT NULL DEFAULT false,
  "contaId"       TEXT NOT NULL,
  "contaOrigemId" TEXT,
  "observacao"    TEXT,
  "arquivado"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "investimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "investimento_contaId_key" ON "investimento"("contaId");
CREATE INDEX IF NOT EXISTS "investimento_arquivado_idx" ON "investimento"("arquivado");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investimento_contaId_fkey') THEN
    ALTER TABLE "investimento" ADD CONSTRAINT "investimento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "conta_bancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investimento_contaOrigemId_fkey') THEN
    ALTER TABLE "investimento" ADD CONSTRAINT "investimento_contaOrigemId_fkey" FOREIGN KEY ("contaOrigemId") REFERENCES "conta_bancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Categorias do sistema (por chave): rendimento é receita do resultado, IR sobre aplicação é despesa do resultado.
-- Entram debaixo de "Receitas"/"Despesas" da semente (chave receita/despesa) no próximo código livre; sem esses pais
-- (plano renumerado), entram no próximo nível 1 livre.
DO $$
DECLARE
  v_pai text;
  v_codpai text;
  v_n int;
  v_cod text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'receita_rendimento_aplicacao') THEN
    SELECT "id", "codigo" INTO v_pai, v_codpai FROM "categoria_financeira" WHERE "chave" = 'receita' LIMIT 1;
    IF v_pai IS NOT NULL THEN
      v_n := 1;
      LOOP
        v_cod := v_codpai || '.' || lpad(v_n::text, 2, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "codigo" = v_cod);
        v_n := v_n + 1;
      END LOOP;
    ELSE
      v_n := 1;
      WHILE EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "codigo" = v_n::text) LOOP v_n := v_n + 1; END LOOP;
      v_cod := v_n::text;
    END IF;
    INSERT INTO "categoria_financeira" ("id", "codigo", "chave", "nome", "tipo", "natureza", "paiId", "ordem", "ativo")
    VALUES (gen_random_uuid()::text, v_cod, 'receita_rendimento_aplicacao', 'Rendimento de aplicações', 'receita', 'resultado', v_pai, 190, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'despesa_ir_aplicacao') THEN
    v_pai := NULL;
    SELECT "id", "codigo" INTO v_pai, v_codpai FROM "categoria_financeira" WHERE "chave" = 'despesa' LIMIT 1;
    IF v_pai IS NOT NULL THEN
      v_n := 1;
      LOOP
        v_cod := v_codpai || '.' || lpad(v_n::text, 2, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "codigo" = v_cod);
        v_n := v_n + 1;
      END LOOP;
    ELSE
      v_n := 1;
      WHILE EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "codigo" = v_n::text) LOOP v_n := v_n + 1; END LOOP;
      v_cod := v_n::text;
    END IF;
    INSERT INTO "categoria_financeira" ("id", "codigo", "chave", "nome", "tipo", "natureza", "paiId", "ordem", "ativo")
    VALUES (gen_random_uuid()::text, v_cod, 'despesa_ir_aplicacao', 'IR sobre aplicações', 'despesa', 'resultado', v_pai, 290, true);
  END IF;
END $$;
