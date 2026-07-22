-- Coordenação BIM: ConversaoModelo passa a referenciar EITHER um Upload (IFC de
-- disciplina) OR uma DocumentoVersao (IFC recebido do cliente). uploadId vira opcional
-- e ganha-se documentoVersaoId. A regra "exatamente um" é garantida em código.

-- uploadId agora é opcional (rows de documento têm uploadId NULL).
ALTER TABLE "conversao_modelo" ALTER COLUMN "uploadId" DROP NOT NULL;

-- Novo vínculo com a versão de documento.
ALTER TABLE "conversao_modelo" ADD COLUMN "documentoVersaoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversao_modelo_documentoVersaoId_key" ON "conversao_modelo"("documentoVersaoId");

-- AddForeignKey
ALTER TABLE "conversao_modelo" ADD CONSTRAINT "conversao_modelo_documentoVersaoId_fkey" FOREIGN KEY ("documentoVersaoId") REFERENCES "documento_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Apontamento sobre um IFC RECEBIDO do cliente não tem disciplina → disciplinaId opcional.
ALTER TABLE "apontamento_coordenacao" ALTER COLUMN "disciplinaId" DROP NOT NULL;
