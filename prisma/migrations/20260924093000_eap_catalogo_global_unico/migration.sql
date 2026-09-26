-- Índice PARCIAL que garante sigla única entre as linhas GLOBAIS de `eap_catalogo`.
--
-- Por que existe: o `@@unique([categoria, sigla, projetoId])` do schema não cobre esse caso.
-- No Postgres, NULL é distinto de NULL para fins de UNIQUE, então duas linhas globais
-- (`projetoId IS NULL`) com a mesma sigla passariam pela constraint sem erro. É a mesma
-- pegadinha já documentada em `DocumentoDisciplina.chave`.
--
-- O Prisma não expressa índice parcial no schema: este índice é invisível para ele e só
-- vive aqui. Não removê-lo por "não estar no schema.prisma".

CREATE UNIQUE INDEX IF NOT EXISTS "eap_catalogo_global_key"
    ON "eap_catalogo" ("categoria", "sigla")
 WHERE "projetoId" IS NULL;
