-- E6 Parte B: verificar ModeloContrato e decidir
-- Uso: psql $DATABASE_URL -f scripts/e6-limpar-modelo-contrato.sql

-- 1. Contar e medir
WITH stats AS (
  SELECT count(*) as cnt, COALESCE(sum(length(conteudo)), 0) as total_size
  FROM modelo_contrato
)
SELECT
  CASE
    WHEN cnt = 0 THEN '✅ VAZIO: pode dropar direto'
    WHEN total_size < 1000 THEN '✅ SÓ RASCUNHO: pode dropar direto'
    ELSE '⚠️ TEXTO REAL: PRECISA EXPORTAR ANTES'
  END as status,
  cnt,
  total_size
FROM stats;

-- 2. Se VAZIO ou RASCUNHO, descomente a linha abaixo para dropar:
-- DROP TABLE modelo_contrato;

-- 3. Se TEXTO REAL, execute primeiro (dentro de pgAdmin ou via pipe):
-- psql $DATABASE_URL -c "COPY modelo_contrato TO '/tmp/modelo_contrato.csv' CSV HEADER;"
-- psql $DATABASE_URL -c "SELECT json_agg(row_to_json(t)) FROM modelo_contrato t;" > /tmp/modelo_contrato.json
-- Depois verifique os arquivos e rode o DROP acima.
