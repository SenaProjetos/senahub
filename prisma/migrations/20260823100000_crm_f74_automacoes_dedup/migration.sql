-- F7.4: sino e marca de deduplicação compartilham o mesmo commit.
CREATE TABLE "automacao_comercial_enviada" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "notificacaoId" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automacao_comercial_enviada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automacao_comercial_enviada_notificacaoId_key"
ON "automacao_comercial_enviada"("notificacaoId");

CREATE UNIQUE INDEX "automacao_comercial_enviada_userId_chave_key"
ON "automacao_comercial_enviada"("userId", "chave");

CREATE INDEX "automacao_comercial_enviada_enviadoEm_idx"
ON "automacao_comercial_enviada"("enviadoEm");

ALTER TABLE "automacao_comercial_enviada"
ADD CONSTRAINT "automacao_comercial_enviada_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automacao_comercial_enviada"
ADD CONSTRAINT "automacao_comercial_enviada_notificacaoId_fkey"
FOREIGN KEY ("notificacaoId") REFERENCES "notificacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
