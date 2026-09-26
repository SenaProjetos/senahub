-- Decisão #1 (2026-09-25): a etapa de terceiro passa a ser MARCADA pelo recurso da linha
-- ("Externo"), não adivinhada pela origem dela.
--
-- O `ALTER TYPE … ADD VALUE` fica SOZINHO nesta migration de propósito: o Postgres não usa um
-- valor de enum na mesma transação que o criou (mesma razão da 20260925110000_status_lancamento_previsao),
-- e o CHECK que cita 'ext' vem na migration seguinte.
ALTER TYPE "PapelEap" ADD VALUE IF NOT EXISTS 'ext';
