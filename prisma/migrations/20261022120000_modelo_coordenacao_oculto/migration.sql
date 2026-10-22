-- CreateTable
CREATE TABLE "modelo_coordenacao_oculto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "ocultadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelo_coordenacao_oculto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modelo_coordenacao_oculto_projetoId_serie_key" ON "modelo_coordenacao_oculto"("projetoId", "serie");

-- AddForeignKey
ALTER TABLE "modelo_coordenacao_oculto" ADD CONSTRAINT "modelo_coordenacao_oculto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
