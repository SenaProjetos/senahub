-- CreateTable
CREATE TABLE "pendencia" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pagina" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "texto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "autorId" TEXT NOT NULL,
    "tarefaId" TEXT,
    "tarefaItemId" TEXT,
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "fechadoPorId" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pendencia_uploadId_numero_idx" ON "pendencia"("uploadId", "numero");

-- CreateIndex
CREATE INDEX "pendencia_disciplinaId_idx" ON "pendencia"("disciplinaId");

-- CreateIndex
CREATE INDEX "pendencia_projetoId_status_idx" ON "pendencia"("projetoId", "status");

-- AddForeignKey
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
