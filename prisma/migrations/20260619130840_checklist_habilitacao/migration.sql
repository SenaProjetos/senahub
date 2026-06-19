-- CreateTable
CREATE TABLE "checklist_habilitacao_modelo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_habilitacao_modelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_habilitacao_modelo_item" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "exigencia" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_habilitacao_modelo_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitacao_habilitacao_item" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "exigencia" TEXT NOT NULL,
    "certidaoId" TEXT,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "licitacao_habilitacao_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_habilitacao_modelo_nome_key" ON "checklist_habilitacao_modelo"("nome");

-- CreateIndex
CREATE INDEX "checklist_habilitacao_modelo_item_modeloId_idx" ON "checklist_habilitacao_modelo_item"("modeloId");

-- CreateIndex
CREATE INDEX "licitacao_habilitacao_item_licitacaoId_idx" ON "licitacao_habilitacao_item"("licitacaoId");

-- CreateIndex
CREATE INDEX "licitacao_habilitacao_item_certidaoId_idx" ON "licitacao_habilitacao_item"("certidaoId");

-- AddForeignKey
ALTER TABLE "checklist_habilitacao_modelo_item" ADD CONSTRAINT "checklist_habilitacao_modelo_item_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "checklist_habilitacao_modelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao_habilitacao_item" ADD CONSTRAINT "licitacao_habilitacao_item_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao_habilitacao_item" ADD CONSTRAINT "licitacao_habilitacao_item_certidaoId_fkey" FOREIGN KEY ("certidaoId") REFERENCES "certidao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
