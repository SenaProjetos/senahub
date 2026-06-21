-- Habilita a extensão pg_trgm (trigramas) para buscas ILIKE rápidas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices GIN trigrama: tornam ILIKE O(log n) em vez de full scan.
CREATE INDEX IF NOT EXISTS idx_projeto_nome_trgm ON "projeto" USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_nome_trgm ON "cliente" USING GIN (nome gin_trgm_ops);

-- Índice B-tree em codigo (já UNIQUE; garante cobertura da busca por dígitos parciais).
CREATE INDEX IF NOT EXISTS idx_projeto_codigo ON "projeto" (codigo);
