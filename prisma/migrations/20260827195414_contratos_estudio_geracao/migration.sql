-- Fase E2/E3 (spec 2026-08-27-contratos-no-estudio.md): geração de contrato via Estúdio de
-- Documentos + cláusulas adicionais por contrato. Ambas as colunas são nullable e aditivas —
-- sem backfill necessário.

-- E3: texto livre injetado no token [ClausulasAdicionais].
ALTER TABLE "documento_juridico" ADD COLUMN "clausulasAdicionais" TEXT;

-- E2: qual DocumentoGerado do Estúdio produziu o PDF desta versão. onDelete SetNull — apagar o
-- relatório do Estúdio não pode apagar uma versão de contrato já potencialmente assinada.
ALTER TABLE "doc_juridico_versao" ADD COLUMN "documentoGeradoId" TEXT;

ALTER TABLE "doc_juridico_versao"
  ADD CONSTRAINT "doc_juridico_versao_documentoGeradoId_fkey"
  FOREIGN KEY ("documentoGeradoId") REFERENCES "documento_gerado"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "doc_juridico_versao_documentoGeradoId_idx" ON "doc_juridico_versao"("documentoGeradoId");
