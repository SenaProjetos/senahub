-- CreateEnum
CREATE TYPE "TipoProjeto" AS ENUM ('particular', 'licitacao');

-- CreateEnum
CREATE TYPE "SituacaoProjeto" AS ENUM ('em_andamento', 'concluido', 'arquivado', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusDisciplina" AS ENUM ('aguardando', 'em_andamento', 'em_revisao', 'entregue', 'aprovado');

-- CreateTable
CREATE TABLE "disciplina_catalogo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "disciplina_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projeto_sequencia" (
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "projeto_sequencia_pkey" PRIMARY KEY ("ano")
);

-- CreateTable
CREATE TABLE "projeto" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "sequencial" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "TipoProjeto" NOT NULL DEFAULT 'particular',
    "situacao" "SituacaoProjeto" NOT NULL DEFAULT 'em_andamento',
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "clienteId" TEXT NOT NULL,
    "areaM2" DECIMAL(12,2),
    "endereco" TEXT,
    "prazoFinal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projeto_membro" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "papel" TEXT,

    CONSTRAINT "projeto_membro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplina" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "StatusDisciplina" NOT NULL DEFAULT 'aguardando',
    "prazo" TIMESTAMP(3),
    "valor" DECIMAL(12,2),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplina_responsavel" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "disciplina_responsavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revisao_disciplina" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "motivo" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisao_disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disciplina_catalogo_nome_key" ON "disciplina_catalogo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "projeto_codigo_key" ON "projeto"("codigo");

-- CreateIndex
CREATE INDEX "projeto_clienteId_idx" ON "projeto"("clienteId");

-- CreateIndex
CREATE INDEX "projeto_situacao_idx" ON "projeto"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "projeto_ano_sequencial_key" ON "projeto"("ano", "sequencial");

-- CreateIndex
CREATE INDEX "projeto_membro_userId_idx" ON "projeto_membro"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "projeto_membro_projetoId_userId_key" ON "projeto_membro"("projetoId", "userId");

-- CreateIndex
CREATE INDEX "disciplina_projetoId_idx" ON "disciplina"("projetoId");

-- CreateIndex
CREATE INDEX "disciplina_status_idx" ON "disciplina"("status");

-- CreateIndex
CREATE INDEX "disciplina_responsavel_userId_idx" ON "disciplina_responsavel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplina_responsavel_disciplinaId_userId_key" ON "disciplina_responsavel"("disciplinaId", "userId");

-- CreateIndex
CREATE INDEX "revisao_disciplina_disciplinaId_idx" ON "revisao_disciplina"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "revisao_disciplina_disciplinaId_numero_key" ON "revisao_disciplina"("disciplinaId", "numero");

-- AddForeignKey
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projeto_membro" ADD CONSTRAINT "projeto_membro_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projeto_membro" ADD CONSTRAINT "projeto_membro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplina" ADD CONSTRAINT "disciplina_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplina_responsavel" ADD CONSTRAINT "disciplina_responsavel_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplina_responsavel" ADD CONSTRAINT "disciplina_responsavel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisao_disciplina" ADD CONSTRAINT "revisao_disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisao_disciplina" ADD CONSTRAINT "revisao_disciplina_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
