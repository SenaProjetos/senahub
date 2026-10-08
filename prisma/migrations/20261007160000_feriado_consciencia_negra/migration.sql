-- Consciência Negra (20/11) é feriado nacional desde 2024 (Lei 14.759/2023) e faltava no cadastro.
-- Entra só nos anos (>= 2024) que JÁ têm feriado nacional cadastrado: num ano sem nenhum, o cálculo
-- do ponto usa a lista do código (`feriadosNacionais`), que já traz o 20/11 — inserir só ele ali
-- desligaria essa rede e faria os outros feriados do ano virarem dia útil.
-- Idempotente: data é única, e um feriado já cadastrado no 20/11 (ex.: municipal) fica como está.
INSERT INTO "feriado" ("id", "data", "nome", "tipo")
SELECT gen_random_uuid()::text, make_date(a.ano, 11, 20), 'Consciência Negra', 'nacional'
FROM (
  SELECT DISTINCT EXTRACT(YEAR FROM "data")::int AS ano
  FROM "feriado"
  WHERE "tipo" = 'nacional'
) a
WHERE a.ano >= 2024
ON CONFLICT ("data") DO NOTHING;
