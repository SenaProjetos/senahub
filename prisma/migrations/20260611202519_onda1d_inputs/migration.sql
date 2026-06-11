-- CreateTable
CREATE TABLE "input_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "disciplina" TEXT,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "input_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_publico_input" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_publico_input_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "input_projeto_projetoId_idx" ON "input_projeto"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "link_publico_input_projetoId_key" ON "link_publico_input"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "link_publico_input_token_key" ON "link_publico_input"("token");

-- AddForeignKey
ALTER TABLE "input_projeto" ADD CONSTRAINT "input_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_publico_input" ADD CONSTRAINT "link_publico_input_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
