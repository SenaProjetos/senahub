-- M7: coleções lógicas compartilhadas de documentos, sem duplicar arquivos físicos.
CREATE TABLE "lista_documentos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_documentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lista_documento_item" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "adicionadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_documento_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lista_documentos_projetoId_idx" ON "lista_documentos"("projetoId");
CREATE INDEX "lista_documentos_criadoPorId_idx" ON "lista_documentos"("criadoPorId");
CREATE INDEX "lista_documento_item_documentoId_idx" ON "lista_documento_item"("documentoId");
CREATE UNIQUE INDEX "lista_documento_item_listaId_documentoId_key" ON "lista_documento_item"("listaId", "documentoId");

ALTER TABLE "lista_documentos" ADD CONSTRAINT "lista_documentos_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lista_documentos" ADD CONSTRAINT "lista_documentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lista_documento_item" ADD CONSTRAINT "lista_documento_item_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "lista_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lista_documento_item" ADD CONSTRAINT "lista_documento_item_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
