-- M2 (Financeiro): regras de preenchimento — condições, ordem e mais campos preenchidos.
-- A regra simples antiga (termo → categoria) vira uma regra com a condição "descrição contém <termo>".
ALTER TABLE "regra_categorizacao" ALTER COLUMN "categoriaId" DROP NOT NULL;
ALTER TABLE "regra_categorizacao"
  ADD COLUMN IF NOT EXISTS "condicoes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "ordem" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "centroId" TEXT,
  ADD COLUMN IF NOT EXISTS "formaId" TEXT,
  ADD COLUMN IF NOT EXISTS "projetoId" TEXT,
  ADD COLUMN IF NOT EXISTS "fornecedorId" TEXT,
  ADD COLUMN IF NOT EXISTS "clienteId" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "usos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ultimoUsoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "regra_categorizacao" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Regras antigas: a condição vem do termo; a ordem, da ordem em que existiam.
UPDATE "regra_categorizacao" r
   SET "condicoes" = jsonb_build_array(jsonb_build_object('campo', 'descricao', 'op', 'contem', 'valor', r."termo")),
       "ordem" = o.n
  FROM (SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS n FROM "regra_categorizacao") o
 WHERE o.id = r.id AND r."condicoes" = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "regra_categorizacao_ordem_idx" ON "regra_categorizacao"("ordem");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regra_categorizacao_centroId_fkey') THEN
    ALTER TABLE "regra_categorizacao" ADD CONSTRAINT "regra_categorizacao_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regra_categorizacao_formaId_fkey') THEN
    ALTER TABLE "regra_categorizacao" ADD CONSTRAINT "regra_categorizacao_formaId_fkey" FOREIGN KEY ("formaId") REFERENCES "forma_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regra_categorizacao_projetoId_fkey') THEN
    ALTER TABLE "regra_categorizacao" ADD CONSTRAINT "regra_categorizacao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regra_categorizacao_fornecedorId_fkey') THEN
    ALTER TABLE "regra_categorizacao" ADD CONSTRAINT "regra_categorizacao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regra_categorizacao_clienteId_fkey') THEN
    ALTER TABLE "regra_categorizacao" ADD CONSTRAINT "regra_categorizacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
