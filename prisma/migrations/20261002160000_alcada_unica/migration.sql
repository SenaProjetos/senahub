-- N3 (núcleo do Financeiro): uma regra de alçada só — as faixas de "Configurações do financeiro".
-- O "limite de alçada" antigo (valor >= limite exige aprovação) só valia quando não havia faixas
-- salvas; aqui ele vira as faixas equivalentes (até limite − R$ 0,01 automático, acima só o admin) e
-- a chave antiga sai. Com faixas já salvas, o limite nunca teve efeito e só é apagado.
DO $$
DECLARE
  lim numeric;
BEGIN
  SELECT (valor #>> '{}')::numeric INTO lim FROM "config_sistema" WHERE chave = 'financeiro.limiteAprovacao';
  IF lim IS NOT NULL AND lim > 0
     AND NOT EXISTS (SELECT 1 FROM "config_sistema" WHERE chave = 'financeiro.niveisAprovacao') THEN
    INSERT INTO "config_sistema" (chave, valor, "updatedAt")
    VALUES (
      'financeiro.niveisAprovacao',
      jsonb_build_array(
        jsonb_build_object('ate', lim - 0.01, 'papeis', '[]'::jsonb),
        jsonb_build_object('ate', NULL, 'papeis', jsonb_build_array('admin'))
      ),
      now()
    );
  END IF;
  DELETE FROM "config_sistema" WHERE chave = 'financeiro.limiteAprovacao';
END $$;
