-- Desligamento: último dia com login, definido pelo RH ao encerrar o vínculo.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "acessoAte" DATE;
