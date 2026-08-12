-- Agendamento de avisos: alvo persistido (resolvido só no disparo) + ciclo de vida.
ALTER TABLE "aviso" ADD COLUMN "alvoUserIds" TEXT[];
ALTER TABLE "aviso" ADD COLUMN "incluirClientes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "aviso" ADD COLUMN "emailSolicitado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "aviso" ADD COLUMN "agendadoPara" TIMESTAMP(3);
ALTER TABLE "aviso" ADD COLUMN "enviadoEm" TIMESTAMP(3);
ALTER TABLE "aviso" ADD COLUMN "canceladoEm" TIMESTAMP(3);

-- Avisos já existentes foram todos enviados na hora da criação.
UPDATE "aviso" SET "enviadoEm" = "criadoEm" WHERE "enviadoEm" IS NULL;
UPDATE "aviso" SET "emailSolicitado" = true WHERE "enviouEmail" = true;

CREATE INDEX "aviso_agendadoPara_enviadoEm_idx" ON "aviso"("agendadoPara", "enviadoEm");
