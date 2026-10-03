-- M7 (Financeiro): baixa completa — juros/multa e desconto viram lançamentos próprios ligados ao principal, e o
-- lançamento ganha número do documento e chave da NF.
ALTER TABLE "lancamento"
  ADD COLUMN IF NOT EXISTS "acessorioDeId" TEXT,
  ADD COLUMN IF NOT EXISTS "numeroDocumento" TEXT,
  ADD COLUMN IF NOT EXISTS "chaveNfe" TEXT;
CREATE INDEX IF NOT EXISTS "lancamento_acessorioDeId_idx" ON "lancamento"("acessorioDeId");
CREATE INDEX IF NOT EXISTS "lancamento_chaveNfe_idx" ON "lancamento"("chaveNfe");
-- Sem FK de propósito (ver o comentário do campo no schema): só a coluna e o índice.

-- Categorias do sistema (por chave), debaixo de Receitas/Despesas da semente no próximo código livre.
DO $$
DECLARE
  v_pai text;
  v_codpai text;
  v_n int;
  v_cod text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'despesa_juros_multas_pagos') THEN
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
    VALUES (gen_random_uuid()::text, v_cod, 'despesa_juros_multas_pagos', 'Juros e multas pagos', 'despesa', 'resultado', v_pai, 291, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'despesa_descontos_concedidos') THEN
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
    VALUES (gen_random_uuid()::text, v_cod, 'despesa_descontos_concedidos', 'Descontos concedidos', 'despesa', 'resultado', v_pai, 292, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'receita_juros_multas_recebidos') THEN
    v_pai := NULL;
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
    VALUES (gen_random_uuid()::text, v_cod, 'receita_juros_multas_recebidos', 'Juros e multas recebidos', 'receita', 'resultado', v_pai, 191, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'receita_descontos_obtidos') THEN
    v_pai := NULL;
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
    VALUES (gen_random_uuid()::text, v_cod, 'receita_descontos_obtidos', 'Descontos obtidos', 'receita', 'resultado', v_pai, 192, true);
  END IF;
END $$;
