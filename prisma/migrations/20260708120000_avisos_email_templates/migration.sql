-- CreateEnum
CREATE TYPE "AvisoAlvoTipo" AS ENUM ('todos', 'categoria', 'usuarios');

-- CreateTable
CREATE TABLE "aviso" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "alvoTipo" "AvisoAlvoTipo" NOT NULL,
    "alvoRoles" TEXT[],
    "exigeConfirmacao" BOOLEAN NOT NULL DEFAULT true,
    "enviouEmail" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso_destinatario" (
    "id" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entregueEm" TIMESTAMP(3),
    "lidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_destinatario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template" (
    "slug" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpoHtml" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "aviso_criadoEm_idx" ON "aviso"("criadoEm");

-- CreateIndex
CREATE INDEX "aviso_destinatario_userId_lidoEm_idx" ON "aviso_destinatario"("userId", "lidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "aviso_destinatario_avisoId_userId_key" ON "aviso_destinatario"("avisoId", "userId");

-- AddForeignKey
ALTER TABLE "aviso" ADD CONSTRAINT "aviso_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_destinatario" ADD CONSTRAINT "aviso_destinatario_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "aviso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_destinatario" ADD CONSTRAINT "aviso_destinatario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
