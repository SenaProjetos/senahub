-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ti';

-- CreateTable
CREATE TABLE "ativo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "localizacao" TEXT,
    "responsavelId" TEXT,
    "dataAquisicao" DATE,
    "valor" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_ti" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "patrimonioId" TEXT,
    "responsavelId" TEXT,
    "cpu" TEXT,
    "ram" TEXT,
    "armazenamento" TEXT,
    "so" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maquina_ti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente_maquina" (
    "id" TEXT NOT NULL,
    "maquinaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "componente_maquina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manutencao_maquina" (
    "id" TEXT NOT NULL,
    "maquinaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "custo" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manutencao_maquina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ativo_categoria_idx" ON "ativo"("categoria");

-- CreateIndex
CREATE INDEX "ativo_status_idx" ON "ativo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_ti_patrimonioId_key" ON "maquina_ti"("patrimonioId");

-- CreateIndex
CREATE INDEX "maquina_ti_responsavelId_idx" ON "maquina_ti"("responsavelId");

-- CreateIndex
CREATE INDEX "componente_maquina_maquinaId_idx" ON "componente_maquina"("maquinaId");

-- CreateIndex
CREATE INDEX "manutencao_maquina_maquinaId_idx" ON "manutencao_maquina"("maquinaId");

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_ti" ADD CONSTRAINT "maquina_ti_patrimonioId_fkey" FOREIGN KEY ("patrimonioId") REFERENCES "ativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_ti" ADD CONSTRAINT "maquina_ti_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_maquina" ADD CONSTRAINT "componente_maquina_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "maquina_ti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao_maquina" ADD CONSTRAINT "manutencao_maquina_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "maquina_ti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
