-- AlterTable
ALTER TABLE "user" ADD COLUMN     "pjId" TEXT;

-- CreateTable
CREATE TABLE "pessoa_juridica" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pessoa_juridica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_juridica_cnpj_key" ON "pessoa_juridica"("cnpj");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_pjId_fkey" FOREIGN KEY ("pjId") REFERENCES "pessoa_juridica"("id") ON DELETE SET NULL ON UPDATE CASCADE;
