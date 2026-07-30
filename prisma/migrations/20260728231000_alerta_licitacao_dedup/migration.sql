-- CreateTable
CREATE TABLE "alerta_licitacao_enviado" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "notificacaoId" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerta_licitacao_enviado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerta_licitacao_enviado_userId_chave_key"
ON "alerta_licitacao_enviado"("userId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_licitacao_enviado_notificacaoId_key"
ON "alerta_licitacao_enviado"("notificacaoId");

-- CreateIndex
CREATE INDEX "alerta_licitacao_enviado_enviadoEm_idx"
ON "alerta_licitacao_enviado"("enviadoEm");

-- AddForeignKey
ALTER TABLE "alerta_licitacao_enviado"
ADD CONSTRAINT "alerta_licitacao_enviado_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_licitacao_enviado"
ADD CONSTRAINT "alerta_licitacao_enviado_notificacaoId_fkey"
FOREIGN KEY ("notificacaoId") REFERENCES "notificacao"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
