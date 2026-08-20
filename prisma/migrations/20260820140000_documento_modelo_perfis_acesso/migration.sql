-- DocumentoModelo.perfis: `Role[]` -> `TEXT[]` guardando `PerfilAcesso.chave`.
-- R6 ("Role como dado") do plano docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md.
--
-- NÃO usa o DROP COLUMN + ADD COLUMN que o `prisma migrate diff` propõe: aquilo descarta o
-- conteúdo da coluna. O censo (scripts/censo-role-como-dado.ts) mediu 0 modelos com
-- `visibilidade = 'perfis'` em produção, então na prática não há nada a perder HOJE — mas a
-- migration roda em qualquer clone (dev de outra pessoa, restore de snapshot antigo), e uma
-- migration destrutiva "porque hoje está vazio" é a mesma aposta que o §13.2 do plano já
-- cobrou caro. Cast preservando dado custa 3 linhas.
ALTER TABLE "documento_modelo"
  ALTER COLUMN "perfis" DROP DEFAULT,
  ALTER COLUMN "perfis" TYPE TEXT[] USING "perfis"::TEXT[],
  ALTER COLUMN "perfis" SET DEFAULT ARRAY[]::TEXT[];

-- O valor do papel vira a CHAVE do perfil semente. Para 6 dos 8 papéis com perfil a string é a
-- mesma; estes dois divergem (ver CHAVE_POR_ROLE em src/modules/usuarios/vinculo/perfil-semente.ts).
-- `admin` não tem perfil por design (bypass via superUsuario) — se aparecer aqui, o modelo
-- simplesmente deixa de casar com alguém, que é o comportamento correto: admin já vê tudo.
UPDATE "documento_modelo"
   SET "perfis" = array_replace("perfis", 'supervisor', 'coordenador')
 WHERE 'supervisor' = ANY ("perfis");

UPDATE "documento_modelo"
   SET "perfis" = array_replace("perfis", 'cliente', 'portal_cliente')
 WHERE 'cliente' = ANY ("perfis");
