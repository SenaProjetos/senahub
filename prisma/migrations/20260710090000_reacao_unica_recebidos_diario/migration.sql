-- Migração manual (banco de dev evoluiu via `db push`; ver memória "drift de migração").
-- Cobre as três mudanças de schema desta branch:
--   1) Reação única por usuário por mensagem (dedup + troca do unique)
--   2) Documento.exibirEmRecebidos (doc do Geral compartilhado em Recebidos)
--   3) Tabela diario_entrada (diário de projeto por disciplina)

-- 1) Dedup: mantém a reação MAIS RECENTE de cada (mensagem, usuário) antes do unique novo.
DELETE FROM "mensagem_reacao" mr
USING "mensagem_reacao" mais_nova
WHERE mr."mensagemId" = mais_nova."mensagemId"
  AND mr."userId" = mais_nova."userId"
  AND (mais_nova."createdAt" > mr."createdAt"
       OR (mais_nova."createdAt" = mr."createdAt" AND mais_nova."id" > mr."id"));

-- DropIndex (unique antigo por emoji)
DROP INDEX IF EXISTS "mensagem_reacao_mensagemId_userId_emoji_key";

-- CreateIndex (unique novo: uma reação por usuário por mensagem)
CREATE UNIQUE INDEX "mensagem_reacao_mensagemId_userId_key" ON "mensagem_reacao"("mensagemId", "userId");

-- 2) AlterTable
ALTER TABLE "documento" ADD COLUMN "exibirEmRecebidos" BOOLEAN NOT NULL DEFAULT false;

-- 3) CreateTable
CREATE TABLE "diario_entrada" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diario_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diario_entrada_disciplinaId_data_idx" ON "diario_entrada"("disciplinaId", "data");

-- CreateIndex
CREATE INDEX "diario_entrada_projetoId_data_idx" ON "diario_entrada"("projetoId", "data");

-- AddForeignKey
ALTER TABLE "diario_entrada" ADD CONSTRAINT "diario_entrada_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_entrada" ADD CONSTRAINT "diario_entrada_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_entrada" ADD CONSTRAINT "diario_entrada_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
