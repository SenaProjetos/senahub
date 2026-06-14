-- AlterTable
ALTER TABLE "ticket_mensagem" ADD COLUMN     "anexoMime" TEXT,
ADD COLUMN     "anexoNome" TEXT,
ADD COLUMN     "anexoPath" TEXT,
ALTER COLUMN "texto" SET DEFAULT '';

-- CreateTable
CREATE TABLE "tarefa_comentario" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "anexoPath" TEXT,
    "anexoNome" TEXT,
    "anexoMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habilidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "habilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_habilidade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habilidadeId" TEXT NOT NULL,

    CONSTRAINT "user_habilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servico_terceirizado" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'contratado',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servico_terceirizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarefa_comentario_tarefaId_idx" ON "tarefa_comentario"("tarefaId");

-- CreateIndex
CREATE UNIQUE INDEX "habilidade_nome_key" ON "habilidade"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "user_habilidade_userId_habilidadeId_key" ON "user_habilidade"("userId", "habilidadeId");

-- CreateIndex
CREATE INDEX "servico_terceirizado_projetoId_idx" ON "servico_terceirizado"("projetoId");

-- AddForeignKey
ALTER TABLE "tarefa_comentario" ADD CONSTRAINT "tarefa_comentario_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_comentario" ADD CONSTRAINT "tarefa_comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_habilidade" ADD CONSTRAINT "user_habilidade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_habilidade" ADD CONSTRAINT "user_habilidade_habilidadeId_fkey" FOREIGN KEY ("habilidadeId") REFERENCES "habilidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servico_terceirizado" ADD CONSTRAINT "servico_terceirizado_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servico_terceirizado" ADD CONSTRAINT "servico_terceirizado_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
