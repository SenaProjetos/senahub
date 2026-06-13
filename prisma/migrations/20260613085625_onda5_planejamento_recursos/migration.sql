-- CreateTable
CREATE TABLE "eap_tarefa" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "parentId" TEXT,
    "disciplinaId" TEXT,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "inicioPrevisto" DATE NOT NULL,
    "fimPrevisto" DATE NOT NULL,
    "inicioBaseline" DATE,
    "fimBaseline" DATE,
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eap_tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eap_dependencia" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "predecessoraId" TEXT NOT NULL,

    CONSTRAINT "eap_dependencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurso" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capacidade" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "custoHora" DECIMAL(10,2),
    "cor" TEXT NOT NULL DEFAULT '#576980',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alocacao" (
    "id" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "percentual" INTEGER NOT NULL DEFAULT 100,
    "inicio" DATE,
    "fim" DATE,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alocacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eap_tarefa_projetoId_idx" ON "eap_tarefa"("projetoId");

-- CreateIndex
CREATE INDEX "eap_tarefa_parentId_idx" ON "eap_tarefa"("parentId");

-- CreateIndex
CREATE INDEX "eap_dependencia_predecessoraId_idx" ON "eap_dependencia"("predecessoraId");

-- CreateIndex
CREATE UNIQUE INDEX "eap_dependencia_tarefaId_predecessoraId_key" ON "eap_dependencia"("tarefaId", "predecessoraId");

-- CreateIndex
CREATE UNIQUE INDEX "recurso_userId_key" ON "recurso"("userId");

-- CreateIndex
CREATE INDEX "alocacao_projetoId_idx" ON "alocacao"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "alocacao_recursoId_projetoId_key" ON "alocacao"("recursoId", "projetoId");

-- AddForeignKey
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_tarefa" ADD CONSTRAINT "eap_tarefa_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_dependencia" ADD CONSTRAINT "eap_dependencia_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_dependencia" ADD CONSTRAINT "eap_dependencia_predecessoraId_fkey" FOREIGN KEY ("predecessoraId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alocacao" ADD CONSTRAINT "alocacao_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "recurso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alocacao" ADD CONSTRAINT "alocacao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
