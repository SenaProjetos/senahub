-- Lixeira das Anotações do chat: soft delete do Canal (só tipo `anotacoes`).
-- Canais com excluidoEm != null ficam restauráveis e são purgados após 30 dias.
ALTER TABLE "canal" ADD COLUMN IF NOT EXISTS "excluidoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "canal_excluidoEm_idx" ON "canal"("excluidoEm");
