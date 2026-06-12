-- CreateTable
CREATE TABLE "sessao_trabalho" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projetoId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessao_trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_trabalho" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "horasDia" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "escala_trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessao_trabalho_userId_inicio_idx" ON "sessao_trabalho"("userId", "inicio");

-- CreateIndex
CREATE INDEX "sessao_trabalho_projetoId_idx" ON "sessao_trabalho"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "escala_trabalho_userId_key" ON "escala_trabalho"("userId");

-- AddForeignKey
ALTER TABLE "sessao_trabalho" ADD CONSTRAINT "sessao_trabalho_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_trabalho" ADD CONSTRAINT "sessao_trabalho_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala_trabalho" ADD CONSTRAINT "escala_trabalho_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
