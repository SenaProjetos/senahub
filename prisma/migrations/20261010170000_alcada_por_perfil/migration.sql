-- Onda F: a alçada de aprovação do financeiro guardava PAPÉIS do enum Role dentro do JSON de
-- configuração (config_sistema 'financeiro.niveisAprovacao', faixas[].papeis). O papel sai do
-- sistema; o campo passa a guardar a CHAVE do perfil de acesso. O token 'admin' fica: quer dizer
-- "superusuário" (faixa só com ele continua exigindo aprovação, só dele).
-- Único valor que muda de nome: 'supervisor' -> 'coordenador' (chave do perfil semente).
UPDATE "config_sistema"
SET "valor" = (
  SELECT COALESCE(jsonb_agg(
    jsonb_set(
      f.faixa,
      '{papeis}',
      COALESCE(
        (SELECT jsonb_agg(CASE WHEN p = 'supervisor' THEN 'coordenador' ELSE p END)
           FROM jsonb_array_elements_text(f.faixa -> 'papeis') AS p),
        '[]'::jsonb
      )
    )
  ), '[]'::jsonb)
  FROM jsonb_array_elements("valor") AS f(faixa)
)
WHERE "chave" = 'financeiro.niveisAprovacao'
  AND jsonb_typeof("valor") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("valor") AS f(faixa)
    WHERE f.faixa -> 'papeis' @> '"supervisor"'::jsonb
  );
