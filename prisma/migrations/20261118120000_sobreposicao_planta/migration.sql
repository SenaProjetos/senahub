-- CreateTable
CREATE TABLE "sobreposicao_planta" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sobreposicao_planta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sobreposicao_camada" (
    "id" TEXT NOT NULL,
    "sobreposicaoId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "base" BOOLEAN NOT NULL DEFAULT false,
    "cor" TEXT NOT NULL,
    "opacidade" INTEGER NOT NULL DEFAULT 80,
    "visivel" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "pagina" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sobreposicao_camada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sobreposicao_alinhamento" (
    "id" TEXT NOT NULL,
    "camadaId" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "tx" DOUBLE PRECISION NOT NULL,
    "ty" DOUBLE PRECISION NOT NULL,
    "giro" DOUBLE PRECISION NOT NULL,
    "escala" DOUBLE PRECISION NOT NULL,
    "uploadConferidoId" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "salvoPorId" TEXT NOT NULL,
    "salvoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sobreposicao_alinhamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sobreposicao_planta_projetoId_nome_key" ON "sobreposicao_planta"("projetoId", "nome");

-- CreateIndex
CREATE INDEX "sobreposicao_camada_documentoId_idx" ON "sobreposicao_camada"("documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "sobreposicao_camada_sobreposicaoId_documentoId_key" ON "sobreposicao_camada"("sobreposicaoId", "documentoId");

-- CreateIndex
CREATE INDEX "sobreposicao_alinhamento_uploadConferidoId_idx" ON "sobreposicao_alinhamento"("uploadConferidoId");

-- CreateIndex
CREATE UNIQUE INDEX "sobreposicao_alinhamento_camadaId_formato_key" ON "sobreposicao_alinhamento"("camadaId", "formato");

-- AddForeignKey
ALTER TABLE "sobreposicao_planta" ADD CONSTRAINT "sobreposicao_planta_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sobreposicao_camada" ADD CONSTRAINT "sobreposicao_camada_sobreposicaoId_fkey" FOREIGN KEY ("sobreposicaoId") REFERENCES "sobreposicao_planta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sobreposicao_camada" ADD CONSTRAINT "sobreposicao_camada_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sobreposicao_alinhamento" ADD CONSTRAINT "sobreposicao_alinhamento_camadaId_fkey" FOREIGN KEY ("camadaId") REFERENCES "sobreposicao_camada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sobreposicao_alinhamento" ADD CONSTRAINT "sobreposicao_alinhamento_uploadConferidoId_fkey" FOREIGN KEY ("uploadConferidoId") REFERENCES "upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Uma base por sobreposição (índice parcial, fora do schema.prisma)
CREATE UNIQUE INDEX "sobreposicao_camada_uma_base" ON "sobreposicao_camada" ("sobreposicaoId") WHERE "base";
