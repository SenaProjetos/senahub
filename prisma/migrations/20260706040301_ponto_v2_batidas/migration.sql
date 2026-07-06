-- CreateEnum
CREATE TYPE "TipoBatidaPonto" AS ENUM ('entrada', 'inicio_descanso', 'fim_descanso', 'saida');

-- CreateEnum
CREATE TYPE "OrigemBatida" AS ENUM ('app', 'offline', 'ajuste_proprio', 'ajuste_admin', 'migracao');

-- CreateEnum
CREATE TYPE "StatusAjustePonto" AS ENUM ('pendente_ciencia', 'ciente', 'contestado');

-- CreateTable
CREATE TABLE "batida" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "tipo" "TipoBatidaPonto" NOT NULL,
    "horario" TIMESTAMP(3) NOT NULL,
    "projetoId" TEXT,
    "origem" "OrigemBatida" NOT NULL DEFAULT 'app',
    "editada" BOOLEAN NOT NULL DEFAULT false,
    "horarioOriginal" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "geo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_role" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "entrada" TEXT,
    "saida" TEXT,
    "descansos" JSONB NOT NULL DEFAULT '[]',
    "horasDia" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "toleranciaMin" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "escala_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_usuario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "entrada" TEXT,
    "saida" TEXT,
    "descansos" JSONB NOT NULL DEFAULT '[]',
    "horasDia" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "toleranciaMin" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "escala_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espelho_aceite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "espelho_aceite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste_ponto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "justificativa" TEXT NOT NULL,
    "snapshotAntes" JSONB NOT NULL,
    "snapshotDepois" JSONB NOT NULL,
    "proprio" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusAjustePonto",
    "cienciaEm" TIMESTAMP(3),
    "contestacaoMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajuste_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_ponto_enviado" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "chave" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerta_ponto_enviado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batida_userId_dia_idx" ON "batida"("userId", "dia");

-- CreateIndex
CREATE INDEX "batida_userId_horario_idx" ON "batida"("userId", "horario");

-- CreateIndex
CREATE UNIQUE INDEX "escala_role_role_diaSemana_key" ON "escala_role"("role", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "escala_usuario_userId_diaSemana_key" ON "escala_usuario"("userId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "espelho_aceite_userId_ano_mes_key" ON "espelho_aceite"("userId", "ano", "mes");

-- CreateIndex
CREATE INDEX "ajuste_ponto_userId_dia_idx" ON "ajuste_ponto"("userId", "dia");

-- CreateIndex
CREATE INDEX "ajuste_ponto_status_idx" ON "ajuste_ponto"("status");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_ponto_enviado_userId_dia_chave_key" ON "alerta_ponto_enviado"("userId", "dia", "chave");

-- AddForeignKey
ALTER TABLE "batida" ADD CONSTRAINT "batida_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batida" ADD CONSTRAINT "batida_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala_usuario" ADD CONSTRAINT "escala_usuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espelho_aceite" ADD CONSTRAINT "espelho_aceite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_ponto" ADD CONSTRAINT "ajuste_ponto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_ponto" ADD CONSTRAINT "ajuste_ponto_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_ponto_enviado" ADD CONSTRAINT "alerta_ponto_enviado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
