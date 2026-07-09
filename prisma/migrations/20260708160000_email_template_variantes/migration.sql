-- CreateTable
CREATE TABLE "email_template_variante" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpoHtml" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_template_variante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_template_variante_slug_idx" ON "email_template_variante"("slug");

-- Migra os overrides existentes (1 variante "Personalizado" por slug)
INSERT INTO "email_template_variante" ("id", "slug", "nome", "assunto", "corpoHtml", "ativo", "updatedById", "updatedAt", "criadoEm")
SELECT md5(random()::text || clock_timestamp()::text || "slug"), "slug", 'Personalizado', "assunto", "corpoHtml", "ativo", "updatedById", "updatedAt", CURRENT_TIMESTAMP
FROM "email_template";

-- DropTable
DROP TABLE "email_template";
