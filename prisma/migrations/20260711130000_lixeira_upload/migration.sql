-- Lixeira do projeto: soft delete de Upload (arquivos de disciplina).
-- Arquivos com excluidoEm != null ficam na lixeira e são purgados após 30 dias.
ALTER TABLE "upload" ADD COLUMN "excluidoEm" TIMESTAMP(3);
ALTER TABLE "upload" ADD COLUMN "excluidoPorId" TEXT;

-- CreateIndex
CREATE INDEX "upload_excluidoEm_idx" ON "upload"("excluidoEm");
