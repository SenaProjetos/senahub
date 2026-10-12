-- Auxílio transporte e alimentação: pagos pela empresa, não saem no holerite do contador; o RH
-- lança à mão (botões do editor do holerite). Aditiva e idempotente (nome é único).
INSERT INTO "rubrica_folha" ("id", "nome", "tipo", "ordem", "ativo")
SELECT gen_random_uuid()::text, v.nome, 'provento'::"TipoRubrica", v.ordem, true
FROM (VALUES ('Auxílio transporte', 8), ('Auxílio alimentação', 9)) AS v(nome, ordem)
ON CONFLICT ("nome") DO NOTHING;
