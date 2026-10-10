-- Onda F: o pagamento por entrega deixa de ler o papel para escolher a categoria do DRE.
-- Regra do dono (2026-10-10): freelancer COM CNPJ = PJ (2.01), SEM CNPJ = freelancer (2.02).
-- O backfill de vínculos gravou todo freelancer como `pj` ("aguardando reclassificação"); aqui a
-- reclassificação acontece para quem NÃO tem pessoa jurídica vinculada (User.pjId nulo):
-- contratação vira `autonomo_rpa` no vínculo ativo e no cache do usuário. Quem tem PJ continua `pj`.
-- Roda antes de 20261010180000 (que apaga o papel). Sem a coluna `role` (banco que já passou da
-- poda), não faz nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'role') THEN
    UPDATE "vinculo" v SET "contratacao" = 'autonomo_rpa'
      FROM "user" u
     WHERE v."userId" = u."id" AND v."ativo" AND v."contratacao" = 'pj'
       AND u."role"::text = 'freelancer' AND u."pjId" IS NULL;
    UPDATE "user" SET "contratacao" = 'autonomo_rpa'
     WHERE "role"::text = 'freelancer' AND "pjId" IS NULL AND "contratacao" = 'pj';
  END IF;
END $$;
