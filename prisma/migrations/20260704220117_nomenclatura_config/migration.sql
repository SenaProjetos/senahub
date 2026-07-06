-- CreateTable
CREATE TABLE "nomenclatura_config" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT,
    "exigir" BOOLEAN NOT NULL DEFAULT true,
    "padrao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nomenclatura_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nomenclatura_config_projetoId_key" ON "nomenclatura_config"("projetoId");

-- AddForeignKey
ALTER TABLE "nomenclatura_config" ADD CONSTRAINT "nomenclatura_config_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
