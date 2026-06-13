-- CreateTable
CREATE TABLE "encargo_faixa" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "limite" DECIMAL(14,2) NOT NULL,
    "aliquota" DECIMAL(6,3) NOT NULL,
    "deduzir" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "encargo_faixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "encargo_faixa_tipo_ordem_idx" ON "encargo_faixa"("tipo", "ordem");
