-- Documentos do cliente (Cliente → Proposta → Projeto).
-- Absorve `proposta_anexo`: cria as novas tabelas, MIGRA os anexos existentes
-- (1 versão cada, derivando clienteId da proposta) e só então dropa a tabela antiga.

-- CreateEnum
CREATE TYPE "OrigemDocumento" AS ENUM ('recebido_cliente', 'interno', 'contrato', 'comercial');

-- CreateEnum
CREATE TYPE "CanalDocumento" AS ENUM ('interno', 'portal', 'link');

-- CreateTable
CREATE TABLE "documento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "propostaId" TEXT,
    "projetoId" TEXT,
    "origem" "OrigemDocumento" NOT NULL DEFAULT 'recebido_cliente',
    "canal" "CanalDocumento" NOT NULL DEFAULT 'interno',
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "descricao" TEXT,
    "autorId" TEXT,
    "enviadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_versao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "caminho" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_versao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_clienteId_idx" ON "documento"("clienteId");

-- CreateIndex
CREATE INDEX "documento_propostaId_idx" ON "documento"("propostaId");

-- CreateIndex
CREATE INDEX "documento_projetoId_idx" ON "documento"("projetoId");

-- CreateIndex
CREATE INDEX "documento_versao_documentoId_idx" ON "documento_versao"("documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "documento_versao_documentoId_numero_key" ON "documento_versao"("documentoId", "numero");

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_versao" ADD CONSTRAINT "documento_versao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migração de dados: proposta_anexo → documento (+ 1 versão). clienteId vem da proposta;
-- anexos órfãos (proposta inexistente) são descartados. hashSha256 fica vazio (legado sem hash).
INSERT INTO "documento" ("id", "clienteId", "propostaId", "projetoId", "origem", "canal", "nome", "autorId", "createdAt", "updatedAt")
SELECT pa."id", p."clienteId", pa."propostaId", NULL, 'comercial', 'interno', pa."nome", pa."autorId", pa."createdAt", pa."createdAt"
FROM "proposta_anexo" pa
JOIN "proposta" p ON p."id" = pa."propostaId";

INSERT INTO "documento_versao" ("id", "documentoId", "numero", "caminho", "nomeArquivo", "mime", "tamanho", "hashSha256", "autorId", "createdAt")
SELECT gen_random_uuid()::text, pa."id", 1, pa."caminho", pa."nome", pa."mime", pa."tamanho", '', pa."autorId", pa."createdAt"
FROM "proposta_anexo" pa
JOIN "proposta" p ON p."id" = pa."propostaId";

-- DropTable (já migrado acima)
DROP TABLE "proposta_anexo";
