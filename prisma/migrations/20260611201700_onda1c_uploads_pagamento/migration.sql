-- CreateEnum
CREATE TYPE "PacoteUpload" AS ENUM ('A', 'B', 'OUTROS');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('pendente', 'pago', 'cancelado');

-- CreateTable
CREATE TABLE "upload" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "pacote" "PacoteUpload" NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "mimeType" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "validado" BOOLEAN NOT NULL DEFAULT false,
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamento_projetista" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "projetistaId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "tipoProfissional" TEXT NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'pendente',
    "liberadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "lancamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamento_projetista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_disciplinaId_pacote_idx" ON "upload"("disciplinaId", "pacote");

-- CreateIndex
CREATE INDEX "upload_autorId_idx" ON "upload"("autorId");

-- CreateIndex
CREATE INDEX "pagamento_projetista_projetistaId_status_idx" ON "pagamento_projetista"("projetistaId", "status");

-- CreateIndex
CREATE INDEX "pagamento_projetista_disciplinaId_idx" ON "pagamento_projetista"("disciplinaId");

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento_projetista" ADD CONSTRAINT "pagamento_projetista_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento_projetista" ADD CONSTRAINT "pagamento_projetista_projetistaId_fkey" FOREIGN KEY ("projetistaId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
