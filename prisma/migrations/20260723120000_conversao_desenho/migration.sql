-- Visualizador DWG: estado da conversão DWG → DXF (via ODA File Converter,
-- subprocesso externo — ver src/modules/dwg/). Referencia EITHER um Upload (DWG de
-- disciplina) OR uma DocumentoVersao (DWG recebido do cliente). A regra "exatamente
-- um" é garantida em código. Tabela própria (não reaproveita conversao_modelo do IFC:
-- job de limpeza e rota de streaming são específicos de cada fluxo).

-- CreateTable
CREATE TABLE "conversao_desenho" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT,
    "documentoVersaoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "progresso" INTEGER,
    "caminhoDxf" TEXT,
    "tamanhoDxf" INTEGER,
    "erro" TEXT,
    "duracaoMs" INTEGER,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversao_desenho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversao_desenho_uploadId_key" ON "conversao_desenho"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "conversao_desenho_documentoVersaoId_key" ON "conversao_desenho"("documentoVersaoId");

-- CreateIndex
CREATE INDEX "conversao_desenho_status_idx" ON "conversao_desenho"("status");

-- AddForeignKey
ALTER TABLE "conversao_desenho" ADD CONSTRAINT "conversao_desenho_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversao_desenho" ADD CONSTRAINT "conversao_desenho_documentoVersaoId_fkey" FOREIGN KEY ("documentoVersaoId") REFERENCES "documento_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
