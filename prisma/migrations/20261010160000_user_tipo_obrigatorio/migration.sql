-- Onda F, bloco C (plano de Setor × Contratação × Perfil de acesso, §16).
-- `tipo` nulo era resolvido em código por `tipoEfetivo()`: papel `cliente` = externo, o resto =
-- interno. Grava exatamente essa regra no banco e torna a coluna obrigatória, para que o código
-- leia só `tipo` e o papel deixe de decidir interno × externo. Ninguém muda de lado: é o mesmo
-- valor que `tipoEfetivo()` já devolvia para cada pessoa.
UPDATE "user" SET "tipo" = CASE WHEN "role" = 'cliente' THEN 'externo'::"TipoUsuario" ELSE 'interno'::"TipoUsuario" END
WHERE "tipo" IS NULL;

ALTER TABLE "user" ALTER COLUMN "tipo" SET NOT NULL;
