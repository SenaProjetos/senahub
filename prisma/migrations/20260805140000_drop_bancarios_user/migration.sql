-- Remove os dados bancários escalares de `user` (sub-etapa 2.2, PASSO 2 de 2).
--
-- PRÉ-REQUISITO: a migration `20260805120000_conta_bancaria_colaborador` já copiou estes valores
-- para `conta_bancaria_colaborador` e apontou `user.contaBancariaPrincipalId`. Sem ela aplicada,
-- este DROP perde dado.
--
-- A guarda abaixo aborta a migration se sobrar alguma linha com dado bancário que NÃO tenha
-- conta correspondente — é o que impede um WHERE errado no passo 1 virar perda silenciosa.
DO $$
DECLARE
  orfas integer;
BEGIN
  SELECT count(*) INTO orfas
  FROM "user" u
  WHERE COALESCE(
          NULLIF(btrim(u."banco"), ''),
          NULLIF(btrim(u."agencia"), ''),
          NULLIF(btrim(u."conta"), ''),
          NULLIF(btrim(u."tipoContaBancaria"), '')
        ) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "conta_bancaria_colaborador" c WHERE c."userId" = u."id"
    );

  IF orfas > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % pessoa(s) com dados bancarios em "user" sem conta correspondente em conta_bancaria_colaborador. Rode o passo 1 antes.',
      orfas;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "agencia",
DROP COLUMN "banco",
DROP COLUMN "conta",
DROP COLUMN "tipoContaBancaria";
