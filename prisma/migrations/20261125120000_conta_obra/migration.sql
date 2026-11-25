-- AlterEnum
ALTER TYPE "TipoTermo" ADD VALUE 'obra';

-- CreateTable
CREATE TABLE "conta_obra" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "clienteId" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conta_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta_obra_projeto" (
    "id" TEXT NOT NULL,
    "contaObraId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "concedidoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conta_obra_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conta_obra_userId_key" ON "conta_obra"("userId");

-- CreateIndex
CREATE INDEX "conta_obra_clienteId_idx" ON "conta_obra"("clienteId");

-- CreateIndex
CREATE INDEX "conta_obra_projeto_projetoId_idx" ON "conta_obra_projeto"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "conta_obra_projeto_contaObraId_projetoId_key" ON "conta_obra_projeto"("contaObraId", "projetoId");

-- AddForeignKey
ALTER TABLE "conta_obra" ADD CONSTRAINT "conta_obra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_obra" ADD CONSTRAINT "conta_obra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_obra_projeto" ADD CONSTRAINT "conta_obra_projeto_contaObraId_fkey" FOREIGN KEY ("contaObraId") REFERENCES "conta_obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_obra_projeto" ADD CONSTRAINT "conta_obra_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

