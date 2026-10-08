-- Gestão de Pessoas F5: documentos de RH com validade e conferência; a pessoa pode enviar os seus.
-- Aditiva. Documentos existentes ficam sem validade (nunca alertam) e conferidos (foram anexados pelo RH).

ALTER TABLE "funcionario_documento" ADD COLUMN "validadeEm" DATE,
ADD COLUMN "avisoFaixa" INTEGER,
ADD COLUMN "conferidoEm" TIMESTAMP(3),
ADD COLUMN "conferidoPorId" TEXT,
ADD COLUMN "enviadoPelaPessoa" BOOLEAN NOT NULL DEFAULT false;

UPDATE "funcionario_documento" SET "conferidoEm" = "createdAt", "conferidoPorId" = "autorId";

CREATE INDEX "funcionario_documento_validadeEm_idx" ON "funcionario_documento"("validadeEm") WHERE "validadeEm" IS NOT NULL;
