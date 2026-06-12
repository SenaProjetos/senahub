-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('pendente', 'aprovado', 'rejeitado');

-- CreateTable
CREATE TABLE "abono_falta" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "motivo" TEXT,
    "atestadoPath" TEXT,
    "atestadoNome" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'pendente',
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abono_falta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ferias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "observacao" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'pendente',
    "validadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ferias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_emocao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "humor" INTEGER NOT NULL,
    "comentario" TEXT,
    "dia" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_emocao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abono_falta_userId_idx" ON "abono_falta"("userId");

-- CreateIndex
CREATE INDEX "abono_falta_status_idx" ON "abono_falta"("status");

-- CreateIndex
CREATE INDEX "ferias_userId_idx" ON "ferias"("userId");

-- CreateIndex
CREATE INDEX "ferias_status_idx" ON "ferias"("status");

-- CreateIndex
CREATE INDEX "registro_emocao_dia_idx" ON "registro_emocao"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "registro_emocao_userId_dia_key" ON "registro_emocao"("userId", "dia");

-- AddForeignKey
ALTER TABLE "abono_falta" ADD CONSTRAINT "abono_falta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abono_falta" ADD CONSTRAINT "abono_falta_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_emocao" ADD CONSTRAINT "registro_emocao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
