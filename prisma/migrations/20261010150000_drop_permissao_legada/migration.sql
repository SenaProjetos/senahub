-- Onda F, bloco F1 (plano de Setor × Contratação × Perfil de acesso, §16).
-- `permissao` era a matriz legada por papel: não autoriza desde a Onda D e só repetia a semente
-- `PERMISSOES_BASE` (o seed fazia upsert + poda). `canRole` (piso de sócio) e a semente dos perfis
-- passaram a ler a constante. Antes do deploy, `scripts/censo-onda-f.ts` (seção 1) compara a tabela
-- com a constante em produção.
-- IF EXISTS: DROP em produção sai junto com o deploy e precisa ser reexecutável.
DROP TABLE IF EXISTS "permissao";
