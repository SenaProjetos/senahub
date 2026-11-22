-- CreateEnum
CREATE TYPE "LadoMensagemPortal" AS ENUM ('cliente', 'equipe');

-- CreateTable
CREATE TABLE "conversa_portal" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaMensagemEm" TIMESTAMP(3),
    "ultimoLado" "LadoMensagemPortal",

    CONSTRAINT "conversa_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_portal" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "lado" "LadoMensagemPortal" NOT NULL,
    "texto" TEXT NOT NULL,
    "comAnexos" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexo_mensagem_portal" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexo_mensagem_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leitura_conversa_portal" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lidaAte" TIMESTAMP(3),
    "emailAvisadoEm" TIMESTAMP(3),

    CONSTRAINT "leitura_conversa_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisao_mensagem_portal" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "resumo" TEXT,
    "marcadaPorId" TEXT NOT NULL,
    "marcadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidaPorId" TEXT,
    "removidaEm" TIMESTAMP(3),

    CONSTRAINT "decisao_mensagem_portal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversa_portal_projetoId_key" ON "conversa_portal"("projetoId");

-- CreateIndex
CREATE INDEX "mensagem_portal_conversaId_criadaEm_idx" ON "mensagem_portal"("conversaId", "criadaEm");

-- CreateIndex
CREATE INDEX "anexo_mensagem_portal_mensagemId_idx" ON "anexo_mensagem_portal"("mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "leitura_conversa_portal_conversaId_userId_key" ON "leitura_conversa_portal"("conversaId", "userId");

-- CreateIndex
CREATE INDEX "decisao_mensagem_portal_mensagemId_idx" ON "decisao_mensagem_portal"("mensagemId");

-- AddForeignKey
ALTER TABLE "conversa_portal" ADD CONSTRAINT "conversa_portal_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_portal" ADD CONSTRAINT "mensagem_portal_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversa_portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_mensagem_portal" ADD CONSTRAINT "anexo_mensagem_portal_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem_portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leitura_conversa_portal" ADD CONSTRAINT "leitura_conversa_portal_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversa_portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisao_mensagem_portal" ADD CONSTRAINT "decisao_mensagem_portal_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem_portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Uma marca ativa por mensagem (fora do schema.prisma).
CREATE UNIQUE INDEX "decisao_mensagem_portal_uma_ativa" ON "decisao_mensagem_portal" ("mensagemId") WHERE "removidaEm" IS NULL;
