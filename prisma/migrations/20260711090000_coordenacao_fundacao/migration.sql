-- CreateTable
CREATE TABLE "conversao_modelo" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "caminhoFrag" TEXT,
    "tamanhoFrag" INTEGER,
    "erro" TEXT,
    "duracaoMs" INTEGER,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversao_modelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apontamento_coordenacao" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "guids" JSONB NOT NULL,
    "camera" JSONB NOT NULL,
    "snapshotPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "prioridade" TEXT,
    "bcfGuid" TEXT,
    "autorId" TEXT NOT NULL,
    "tarefaId" TEXT,
    "tarefaItemId" TEXT,
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "fechadoPorId" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apontamento_coordenacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversao_modelo_uploadId_key" ON "conversao_modelo"("uploadId");

-- CreateIndex
CREATE INDEX "conversao_modelo_status_idx" ON "conversao_modelo"("status");

-- CreateIndex
CREATE INDEX "apontamento_coordenacao_projetoId_status_idx" ON "apontamento_coordenacao"("projetoId", "status");

-- CreateIndex
CREATE INDEX "apontamento_coordenacao_projetoId_numero_idx" ON "apontamento_coordenacao"("projetoId", "numero");

-- CreateIndex
CREATE INDEX "apontamento_coordenacao_disciplinaId_idx" ON "apontamento_coordenacao"("disciplinaId");

-- AddForeignKey
ALTER TABLE "conversao_modelo" ADD CONSTRAINT "conversao_modelo_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
