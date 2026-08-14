-- Soft-retire de documento absorvido por outro (M4 do plano da Fase 2).
--
-- O merge por nome-base une PDF e DWG que hoje são documentos separados. O perdedor do
-- merge NÃO é apagado: `AuditLog.entidadeId` guarda id de documento sem FK, e um DELETE
-- deixaria esses registros históricos apontando para o nada. A linha fica como apelido,
-- e `resolverDocumentoCanonico()` segue a cadeia até o documento vivo.
--
-- Aditiva e reversível: coluna nullable, nenhuma linha existente é reescrita. O merge em
-- si é feito por script (scripts/merge-documentos-por-base.ts), com relatório antes.

-- AlterTable
ALTER TABLE "documento_disciplina" ADD COLUMN     "substituidoPorId" TEXT;

-- CreateIndex
CREATE INDEX "documento_disciplina_substituidoPorId_idx" ON "documento_disciplina"("substituidoPorId");

-- AddForeignKey: SET NULL — se o canônico sumir, o apelido vira documento solto de novo,
-- nunca desaparece junto.
ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_substituidoPorId_fkey" FOREIGN KEY ("substituidoPorId") REFERENCES "documento_disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;
