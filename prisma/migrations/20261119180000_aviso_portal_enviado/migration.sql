-- Resumo diário do portal do cliente (spec docs/superpowers/specs/2026-11-19-portal-resumo-diario-design.md).
-- Reserva de cada envio (conta, projeto, dia, canal): a chave única impede o resumo duplicado.
-- CreateTable
CREATE TABLE "aviso_portal_enviado" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "canal" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_portal_enviado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aviso_portal_enviado_projetoId_idx" ON "aviso_portal_enviado"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "aviso_portal_enviado_userId_projetoId_dia_canal_key" ON "aviso_portal_enviado"("userId", "projetoId", "dia", "canal");

-- AddForeignKey
ALTER TABLE "aviso_portal_enviado" ADD CONSTRAINT "aviso_portal_enviado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_portal_enviado" ADD CONSTRAINT "aviso_portal_enviado_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

