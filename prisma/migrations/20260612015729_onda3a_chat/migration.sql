-- CreateEnum
CREATE TYPE "TipoCanal" AS ENUM ('geral', 'projeto', 'disciplina', 'dm');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('disponivel', 'ocupado', 'reuniao');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "chatStatus" "ChatStatus" NOT NULL DEFAULT 'disponivel';

-- CreateTable
CREATE TABLE "canal" (
    "id" TEXT NOT NULL,
    "tipo" "TipoCanal" NOT NULL,
    "nome" TEXT,
    "projetoId" TEXT,
    "disciplinaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal_membro" (
    "id" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "canal_membro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem" (
    "id" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "fixada" BOOLEAN NOT NULL DEFAULT false,
    "anexoPath" TEXT,
    "anexoNome" TEXT,
    "anexoMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canal_tipo_idx" ON "canal"("tipo");

-- CreateIndex
CREATE INDEX "canal_projetoId_idx" ON "canal"("projetoId");

-- CreateIndex
CREATE INDEX "canal_disciplinaId_idx" ON "canal"("disciplinaId");

-- CreateIndex
CREATE INDEX "canal_membro_userId_idx" ON "canal_membro"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "canal_membro_canalId_userId_key" ON "canal_membro"("canalId", "userId");

-- CreateIndex
CREATE INDEX "mensagem_canalId_createdAt_idx" ON "mensagem"("canalId", "createdAt");

-- AddForeignKey
ALTER TABLE "canal" ADD CONSTRAINT "canal_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal" ADD CONSTRAINT "canal_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_membro" ADD CONSTRAINT "canal_membro_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_membro" ADD CONSTRAINT "canal_membro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
