-- Revisão marcada para o cliente (reunião de 29/09/2026): o documento guarda QUAL revisão aparece nas
-- pastas "Compartilhado" e "Liberado para obra" do link. Revisão nova não move o ponteiro — a equipe
-- segue versionando e o cliente só vê a próxima quando alguém marcar de novo.
--
-- Aditiva: duas colunas nullable com FK SET NULL (apagar a revisão tira o documento da pasta, nunca
-- apaga o documento). O backfill só liga o que JÁ tinha o status "Liberado para obra" posto à mão,
-- na última revisão com arquivo validado — o mesmo que marcar pela tela faria hoje. Documento sem
-- arquivo validado fica sem ponteiro (o link nunca mostrou arquivo não validado).

-- AlterTable
ALTER TABLE "documento_disciplina" ADD COLUMN "revisaoCompartilhadaId" TEXT,
ADD COLUMN "revisaoLiberadaObraId" TEXT;

-- CreateIndex
CREATE INDEX "documento_disciplina_revisaoCompartilhadaId_idx" ON "documento_disciplina"("revisaoCompartilhadaId");

-- CreateIndex
CREATE INDEX "documento_disciplina_revisaoLiberadaObraId_idx" ON "documento_disciplina"("revisaoLiberadaObraId");

-- AddForeignKey
ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_revisaoCompartilhadaId_fkey" FOREIGN KEY ("revisaoCompartilhadaId") REFERENCES "documento_revisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_revisaoLiberadaObraId_fkey" FOREIGN KEY ("revisaoLiberadaObraId") REFERENCES "documento_revisao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: "Liberado para obra" posto à mão antes deste deploy → ponteiro na última revisão validada.
UPDATE "documento_disciplina" d
SET "revisaoLiberadaObraId" = (
  SELECT r.id
  FROM "documento_revisao" r
  WHERE r."documentoId" = d.id
    AND EXISTS (
      SELECT 1 FROM "upload" u
      WHERE u."revisaoId" = r.id AND u."excluidoEm" IS NULL AND u.validado = true
    )
  ORDER BY r.numero DESC
  LIMIT 1
)
FROM "documento_status" s
WHERE s.id = d."statusId"
  AND s.chave = 'liberado_obra'
  AND d."revisaoLiberadaObraId" IS NULL;
