-- Fase 5a: absorve o repositório "Geral" do projeto (arquivo_projeto / arquivo_projeto_versao)
-- no model unificado `documento` (origem=interno, canal=interno). Preserva os IDs para que
-- os logs de auditoria antigos (entidadeId = id do arquivo/versão) continuem batendo, migra
-- as versões 1:1 e só então dropa as tabelas antigas.

-- Migração de dados: arquivo_projeto → documento. clienteId vem do projeto (NOT NULL no schema);
-- autorId é anulado se o usuário não existir mais (FK do documento é ON DELETE SET NULL).
INSERT INTO "documento" ("id", "clienteId", "propostaId", "projetoId", "origem", "canal", "nome", "categoria", "descricao", "autorId", "createdAt", "updatedAt")
SELECT ap."id",
       p."clienteId",
       NULL,
       ap."projetoId",
       'interno',
       'interno',
       ap."nome",
       ap."categoria",
       ap."descricao",
       (SELECT u."id" FROM "user" u WHERE u."id" = ap."autorId"),
       ap."createdAt",
       ap."updatedAt"
FROM "arquivo_projeto" ap
JOIN "projeto" p ON p."id" = ap."projetoId";

-- Versões: arquivo_projeto_versao → documento_versao (1:1, preserva id/numero/hash).
INSERT INTO "documento_versao" ("id", "documentoId", "numero", "caminho", "nomeArquivo", "mime", "tamanho", "hashSha256", "autorId", "createdAt")
SELECT apv."id",
       apv."arquivoId",
       apv."numero",
       apv."caminho",
       apv."nomeArquivo",
       apv."mime",
       apv."tamanho",
       apv."hashSha256",
       (SELECT u."id" FROM "user" u WHERE u."id" = apv."autorId"),
       apv."createdAt"
FROM "arquivo_projeto_versao" apv;

-- DropTable (já migrado acima). Versão primeiro (FK → arquivo_projeto).
DROP TABLE "arquivo_projeto_versao";
DROP TABLE "arquivo_projeto";
