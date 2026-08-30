-- `credencial.estado` guarda UF (2 letras) MAS também `NACIONAL` e `NA`, que o filtro de Estado
-- exige (§10/§15 da spec). Nasceu VARCHAR(2) e só não quebrou porque a tabela estava vazia:
-- o primeiro software nacional cadastrado estouraria com 22001.
-- Alargar não perde dado e não exige backfill.
ALTER TABLE "credencial" ALTER COLUMN "estado" TYPE VARCHAR(16);
