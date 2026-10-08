-- Gestão de Pessoas F3: liderança direta datada, objetivos de desenvolvimento e encontros 1:1.
-- Aditiva: três tabelas novas; FeedbackRH continua como está (aparece como histórico).

CREATE TYPE "StatusObjetivo" AS ENUM ('aberto', 'concluido', 'cancelado');
CREATE TYPE "VisibilidadeRegistro" AS ENUM ('lider_rh', 'compartilhado');

CREATE TABLE "lideranca_pessoa" (
    "id" TEXT NOT NULL,
    "liderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inicio" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" DATE,
    "cadenciaDias" INTEGER NOT NULL DEFAULT 30,
    "lembradoEm" DATE,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lideranca_pessoa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lideranca_nao_a_si_mesmo" CHECK ("liderId" <> "userId"),
    CONSTRAINT "lideranca_cadencia_faixa" CHECK ("cadenciaDias" BETWEEN 7 AND 180)
);
CREATE INDEX "lideranca_pessoa_liderId_fim_idx" ON "lideranca_pessoa"("liderId", "fim");
CREATE INDEX "lideranca_pessoa_userId_fim_idx" ON "lideranca_pessoa"("userId", "fim");
-- No máximo uma liderança ATIVA por liderado (índice parcial: fora do schema.prisma).
CREATE UNIQUE INDEX "lideranca_uma_ativa" ON "lideranca_pessoa"("userId") WHERE "fim" IS NULL;
ALTER TABLE "lideranca_pessoa" ADD CONSTRAINT "lideranca_pessoa_liderId_fkey" FOREIGN KEY ("liderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lideranca_pessoa" ADD CONSTRAINT "lideranca_pessoa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "objetivo_desenvolvimento" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resultadoEsperado" TEXT,
    "alvo" DATE,
    "status" "StatusObjetivo" NOT NULL DEFAULT 'aberto',
    "habilidadeId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    CONSTRAINT "objetivo_desenvolvimento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "objetivo_desenvolvimento_userId_status_idx" ON "objetivo_desenvolvimento"("userId", "status");
ALTER TABLE "objetivo_desenvolvimento" ADD CONSTRAINT "objetivo_desenvolvimento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "objetivo_desenvolvimento" ADD CONSTRAINT "objetivo_desenvolvimento_habilidadeId_fkey" FOREIGN KEY ("habilidadeId") REFERENCES "habilidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "encontro_um_a_um" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liderId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "pauta" TEXT,
    "decisoes" TEXT,
    "acoes" TEXT,
    "proximoEm" DATE,
    "visibilidade" "VisibilidadeRegistro" NOT NULL DEFAULT 'lider_rh',
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "encontro_um_a_um_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "encontro_um_a_um_userId_data_idx" ON "encontro_um_a_um"("userId", "data");
ALTER TABLE "encontro_um_a_um" ADD CONSTRAINT "encontro_um_a_um_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
