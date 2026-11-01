-- Dispensa de pendência do ciclo documental. Só tabela nova: nada existente muda, sem seed e sem permissão.
-- CreateTable
CREATE TABLE "dispensa_pendencia_ciclo" (
    "id" TEXT NOT NULL,
    "alvoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadaPorId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desfeitaEm" TIMESTAMP(3),
    "desfeitaPorId" TEXT,

    CONSTRAINT "dispensa_pendencia_ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispensa_pendencia_ciclo_alvoId_tipo_idx" ON "dispensa_pendencia_ciclo"("alvoId", "tipo");

-- Uma dispensa ativa por alvo+tipo. É o que faz duas dispensas simultâneas da mesma pendência
-- terminarem em P2002 (a segunda recebe "já está dispensada") em vez de gravar duas linhas.
CREATE UNIQUE INDEX "dispensa_pendencia_ciclo_uma_ativa" ON "dispensa_pendencia_ciclo"("alvoId", "tipo") WHERE "desfeitaEm" IS NULL;
