-- Planejador de caixa (F6B): categorias de distribuição a sócios. Aditiva: só insere, e por `chave`
-- (o código é editável e o import do Meu Dinheiro pode já ter criado um "3"). Natureza
-- `fora_do_resultado` + grupo DFC `financiamento`: sai do caixa, aparece no DFC, NÃO é despesa na DRE.
DO $$
DECLARE
  v_codigo_pai text;
  v_pai_id text;
  n int := 3;
BEGIN
  IF EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "chave" = 'distribuicao_socios') THEN
    RETURN;
  END IF;

  -- Próximo código de nível 1 livre (3, 4, 5…): o import do Meu Dinheiro costuma ocupar o 3.
  WHILE EXISTS (SELECT 1 FROM "categoria_financeira" WHERE "codigo" = n::text) LOOP
    n := n + 1;
  END LOOP;
  v_codigo_pai := n::text;

  INSERT INTO "categoria_financeira" ("id", "codigo", "chave", "nome", "tipo", "natureza", "grupoDfc", "ordem", "ativo")
  VALUES (gen_random_uuid()::text, v_codigo_pai, 'distribuicao_socios', 'Distribuições a sócios', 'despesa', 'fora_do_resultado', 'financiamento', 300, true)
  RETURNING "id" INTO v_pai_id;

  INSERT INTO "categoria_financeira" ("id", "codigo", "chave", "nome", "tipo", "natureza", "grupoDfc", "paiId", "ordem", "ativo")
  VALUES
    (gen_random_uuid()::text, v_codigo_pai || '.01', 'distribuicao_lucros', 'Distribuição de lucros', 'despesa', 'fora_do_resultado', 'financiamento', v_pai_id, 301, true),
    (gen_random_uuid()::text, v_codigo_pai || '.02', 'adiantamento_lucros', 'Adiantamento de lucros', 'despesa', 'fora_do_resultado', 'financiamento', v_pai_id, 302, true);
END $$;
