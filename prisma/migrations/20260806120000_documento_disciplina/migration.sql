-- Documento lógico de disciplina (pai das versões de Upload) + reancoragem das pendências.
-- Antes disto a cadeia de versões era derivada em runtime por
-- (disciplinaId, pacote|pastaId, nomeArquivo), o que quebrava ao renomear e não dava
-- âncora estável para apontamentos. Ver docs/ANALISE_APONTAMENTOS.md (item 1 / Fase A).
--
-- Todas as colunas novas são NULLABLE de propósito: `pacote` XOR `pastaId` não é
-- garantido por constraint no banco, então uma coluna NOT NULL derrubaria o deploy
-- numa linha inesperada. FK nula degrada; FK obrigatória quebra.

-- AlterTable
ALTER TABLE "pendencia" ADD COLUMN     "documentoId" TEXT,
ADD COLUMN     "uploadVerificacaoId" TEXT;

-- AlterTable
ALTER TABLE "upload" ADD COLUMN     "documentoId" TEXT;

-- CreateTable
CREATE TABLE "documento_disciplina" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_disciplina_disciplinaId_idx" ON "documento_disciplina"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "documento_disciplina_disciplinaId_chave_key" ON "documento_disciplina"("disciplinaId", "chave");

-- CreateIndex
CREATE INDEX "pendencia_documentoId_numero_idx" ON "pendencia"("documentoId", "numero");

-- CreateIndex
CREATE INDEX "pendencia_uploadVerificacaoId_idx" ON "pendencia"("uploadVerificacaoId");

-- CreateIndex
CREATE INDEX "upload_documentoId_idx" ON "upload"("documentoId");

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_uploadVerificacaoId_fkey" FOREIGN KEY ("uploadVerificacaoId") REFERENCES "upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- BACKFILL (roda depois das FKs de propósito: backfill inconsistente falha alto,
-- em vez de gravar id órfão em silêncio).
-- ─────────────────────────────────────────────────────────────

-- 1) Um pai por grupo (disciplinaId, chave).
--    Inclui DELIBERADAMENTE linhas na lixeira (`excluidoEm` não-nulo): a cadeia de versões
--    sempre incluiu as excluídas (ver renomearUpload em modules/uploads/actions.ts, que
--    renomeia sem filtrar excluidoEm). Filtrar aqui deixaria uma versão restaurada órfã e
--    o próximo upload do mesmo nome criaria um SEGUNDO pai para o mesmo documento.
--    O 3º argumento do COALESCE é defensivo: `pacote` XOR `pastaId` é convenção de código,
--    não constraint — se ambos forem nulos, a chave viraria NULL e o UNIQUE (que trata NULL
--    como distinto) deixaria passar duplicata silenciosa.
INSERT INTO "documento_disciplina" ("id", "disciplinaId", "chave", "nomeArquivo", "createdAt")
SELECT
  gen_random_uuid()::text,
  u."disciplinaId",
  COALESCE(u."pacote"::text, 'pasta:' || u."pastaId", 'sem-local') || '/' || u."nomeArquivo",
  MIN(u."nomeArquivo"),
  MIN(u."createdAt")
FROM "upload" u
GROUP BY
  u."disciplinaId",
  COALESCE(u."pacote"::text, 'pasta:' || u."pastaId", 'sem-local') || '/' || u."nomeArquivo";

-- 2) Liga cada versão (Upload) ao seu pai.
UPDATE "upload" u
SET "documentoId" = d."id"
FROM "documento_disciplina" d
WHERE d."disciplinaId" = u."disciplinaId"
  AND d."chave" = COALESCE(u."pacote"::text, 'pasta:' || u."pastaId", 'sem-local') || '/' || u."nomeArquivo";

-- 3) Reancora as pendências no documento da sua versão de ORIGEM (`pendencia.uploadId`,
--    que permanece intacto e passa a significar "versão onde o apontamento nasceu").
UPDATE "pendencia" p
SET "documentoId" = u."documentoId"
FROM "upload" u
WHERE u."id" = p."uploadId";
