-- Item 7: evidência antes/depois. Coluna no anexo que já existe (item 12), não tabela nova —
-- R4 pediu histórico completo versionado, e N linhas por momento ordenadas por `createdAt` já
-- são o histórico. Aditiva e nullable: anexo existente continua sendo anexo comum (momento null).
ALTER TABLE "pendencia_anexo" ADD COLUMN "momento" TEXT;

-- A caixa de evidência lê "antes"/"depois" separados, sempre dentro de um apontamento.
CREATE INDEX "pendencia_anexo_pendenciaId_momento_idx" ON "pendencia_anexo"("pendenciaId", "momento");
