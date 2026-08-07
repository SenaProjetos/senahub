-- Contas bancárias do colaborador 1:N + PIX (sub-etapa 2.2, PASSO 1 de 2).
--
-- Este passo é ADITIVO e COPIA os dados. As 4 colunas antigas de `user`
-- (banco/agencia/conta/tipoContaBancaria) continuam existindo e intactas — quem as remove é a
-- migration seguinte (`..._drop_bancarios_user`).
--
-- A separação em dois passos é deliberada: se o WHERE da cópia estivesse errado, um DROP no
-- mesmo arquivo apagaria dado bancário real sem nenhuma linha copiada. Entre um passo e outro
-- dá para conferir a contagem (ver o comentário no fim deste arquivo).

-- CreateEnum
CREATE TYPE "TipoPix" AS ENUM ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "contaBancariaPrincipalId" TEXT;

-- CreateTable
CREATE TABLE "conta_bancaria_colaborador" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "tipoConta" TEXT,
    "titular" TEXT,
    "pixTipo" "TipoPix",
    "pixChave" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conta_bancaria_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conta_bancaria_colaborador_userId_idx" ON "conta_bancaria_colaborador"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_contaBancariaPrincipalId_key" ON "user"("contaBancariaPrincipalId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_contaBancariaPrincipalId_fkey" FOREIGN KEY ("contaBancariaPrincipalId") REFERENCES "conta_bancaria_colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_bancaria_colaborador" ADD CONSTRAINT "conta_bancaria_colaborador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRAÇÃO DE DADOS: uma conta por pessoa que tenha QUALQUER um dos 4 campos
-- preenchido. Campo em branco conta como vazio (btrim), para não criar conta
-- fantasma de quem só tem espaços.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "conta_bancaria_colaborador"
  ("id", "userId", "banco", "agencia", "conta", "tipoConta", "ativo", "criadoEm", "atualizadoEm")
SELECT
  gen_random_uuid()::text,
  u."id",
  NULLIF(btrim(u."banco"), ''),
  NULLIF(btrim(u."agencia"), ''),
  NULLIF(btrim(u."conta"), ''),
  NULLIF(btrim(u."tipoContaBancaria"), ''),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u
WHERE COALESCE(
        NULLIF(btrim(u."banco"), ''),
        NULLIF(btrim(u."agencia"), ''),
        NULLIF(btrim(u."conta"), ''),
        NULLIF(btrim(u."tipoContaBancaria"), '')
      ) IS NOT NULL;

-- A conta recém-criada vira a principal. Neste ponto existe no máximo uma por pessoa,
-- então o `@unique` de `contaBancariaPrincipalId` não pode ser violado.
UPDATE "user" u
SET "contaBancariaPrincipalId" = c."id"
FROM "conta_bancaria_colaborador" c
WHERE c."userId" = u."id"
  AND u."contaBancariaPrincipalId" IS NULL;

-- CONFERÊNCIA antes de aplicar o passo 2 (as duas contagens têm de bater):
--   SELECT count(*) FROM "user"
--     WHERE COALESCE(NULLIF(btrim("banco"),''), NULLIF(btrim("agencia"),''),
--                    NULLIF(btrim("conta"),''), NULLIF(btrim("tipoContaBancaria"),'')) IS NOT NULL;
--   SELECT count(*) FROM "conta_bancaria_colaborador";
