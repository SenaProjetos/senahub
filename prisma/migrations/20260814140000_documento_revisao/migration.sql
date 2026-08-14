-- Revisão de documento: o nível que faltava entre o documento lógico e o arquivo físico.
--
-- Hoje cada `upload` carrega o próprio contador (`versao`), então PDF e DWG da mesma
-- prancha são duas linhagens independentes — a "R03" de um não tem relação com a do
-- outro. `documento_revisao` passa a ser o ponto no tempo ao qual os dois se penduram.
-- Ver docs/auditoria/03-plano-refatoracao.md §2 (M1 e M2).
--
-- AMBAS as mudanças são ADITIVAS e reversíveis: a tabela nasce vazia e `upload.revisaoId`
-- nasce NULA em toda linha existente. O backfill vem em script separado
-- (scripts/backfill-documento-revisao.ts), nunca aqui — SQL de migration não tem como
-- registrar o que tocou nem rodar em modo relatório antes.
--
-- `upload.versao` NÃO é removido: a validação por-arquivo (`entregaveisAtuais`) ainda lê
-- esse contador. Os dois convivem durante a Fase 2; tirar o `versao` é decisão de uma
-- onda posterior, quando nada mais depender dele.

-- CreateTable
CREATE TABLE "documento_revisao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "documento_revisao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documento_revisao_documentoId_numero_key" ON "documento_revisao"("documentoId", "numero");

-- CreateIndex
CREATE INDEX "documento_revisao_documentoId_idx" ON "documento_revisao"("documentoId");

-- CreateIndex
CREATE INDEX "documento_revisao_createdById_idx" ON "documento_revisao"("createdById");

-- AddForeignKey
ALTER TABLE "documento_revisao" ADD CONSTRAINT "documento_revisao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_revisao" ADD CONSTRAINT "documento_revisao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: nullable, sem default — nenhuma linha existente é reescrita.
ALTER TABLE "upload" ADD COLUMN     "revisaoId" TEXT;

-- CreateIndex: o Prisma não cria índice do lado da FK sozinho.
CREATE INDEX "upload_revisaoId_idx" ON "upload"("revisaoId");

-- AddForeignKey: SET NULL — apagar uma revisão nunca pode apagar o arquivo em si.
ALTER TABLE "upload" ADD CONSTRAINT "upload_revisaoId_fkey" FOREIGN KEY ("revisaoId") REFERENCES "documento_revisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
