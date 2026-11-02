-- Lote 3 (2026-11-02): registro dos e-mails de acompanhamento enviados ao cliente de um projeto.
-- Tabela nova, sem backfill.
CREATE TABLE "email_acompanhamento" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "enviadoPorId" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assunto" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "destinatarios" TEXT[],
    "copiaPara" TEXT,
    "observacao" TEXT,
    "itens" JSONB NOT NULL,

    CONSTRAINT "email_acompanhamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_acompanhamento_messageId_key" ON "email_acompanhamento"("messageId");
CREATE INDEX "email_acompanhamento_projetoId_enviadoEm_idx" ON "email_acompanhamento"("projetoId", "enviadoEm");

ALTER TABLE "email_acompanhamento" ADD CONSTRAINT "email_acompanhamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_acompanhamento" ADD CONSTRAINT "email_acompanhamento_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
