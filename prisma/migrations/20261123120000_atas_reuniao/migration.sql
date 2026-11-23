-- CreateEnum
CREATE TYPE "EstadoAtaVersao" AS ENUM ('rascunho', 'publicada', 'substituida');

-- CreateEnum
CREATE TYPE "RespostaAta" AS ENUM ('concorda', 'observacoes');

-- CreateEnum
CREATE TYPE "TipoItemAta" AS ENUM ('decisao', 'tarefa_equipe', 'pendencia_cliente');

-- CreateEnum
CREATE TYPE "SituacaoPendenciaCliente" AS ENUM ('aberta', 'aguardando_conferencia', 'conferida', 'reaberta', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoArquivoAta" AS ENUM ('anotacoes', 'transcricao');

-- CreateTable
CREATE TABLE "reuniao_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "criadaPorId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiradaEm" TIMESTAMP(3),
    "retiradaPorId" TEXT,
    "retiradaPorNome" TEXT,
    "motivoRetirada" TEXT,

    CONSTRAINT "reuniao_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ata_versao" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoAtaVersao" NOT NULL DEFAULT 'rascunho',
    "texto" TEXT NOT NULL,
    "publicadaEm" TIMESTAMP(3),
    "publicadaPorId" TEXT,
    "publicadaPorNome" TEXT,
    "resposta" "RespostaAta",
    "observacao" TEXT,
    "respondidaPorId" TEXT,
    "respondidaPorNome" TEXT,
    "respondidaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ata_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ata_item" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" "TipoItemAta" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavelId" TEXT,
    "prazo" DATE,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "ata_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pendencia_cliente" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prazo" DATE,
    "situacao" "SituacaoPendenciaCliente" NOT NULL DEFAULT 'aberta',
    "feitaEm" TIMESTAMP(3),
    "feitaPorId" TEXT,
    "feitaPorNome" TEXT,
    "comentarioFeito" TEXT,
    "conferidaEm" TIMESTAMP(3),
    "conferidaPorId" TEXT,
    "reabertaEm" TIMESTAMP(3),
    "reabertaPorId" TEXT,
    "motivoReabertura" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendencia_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_da_ata" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,

    CONSTRAINT "tarefa_da_ata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_ata" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "tipo" "TipoArquivoAta" NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivo_ata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reuniao_projeto_projetoId_data_idx" ON "reuniao_projeto"("projetoId", "data");

-- CreateIndex
CREATE INDEX "ata_versao_reuniaoId_estado_idx" ON "ata_versao"("reuniaoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ata_versao_reuniaoId_numero_key" ON "ata_versao"("reuniaoId", "numero");

-- CreateIndex
CREATE INDEX "ata_item_versaoId_idx" ON "ata_item"("versaoId");

-- CreateIndex
CREATE INDEX "ata_item_chave_idx" ON "ata_item"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "pendencia_cliente_chave_key" ON "pendencia_cliente"("chave");

-- CreateIndex
CREATE INDEX "pendencia_cliente_reuniaoId_idx" ON "pendencia_cliente"("reuniaoId");

-- CreateIndex
CREATE INDEX "pendencia_cliente_projetoId_situacao_idx" ON "pendencia_cliente"("projetoId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_da_ata_chave_key" ON "tarefa_da_ata"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_da_ata_tarefaId_key" ON "tarefa_da_ata"("tarefaId");

-- CreateIndex
CREATE INDEX "tarefa_da_ata_reuniaoId_idx" ON "tarefa_da_ata"("reuniaoId");

-- CreateIndex
CREATE INDEX "arquivo_ata_reuniaoId_idx" ON "arquivo_ata"("reuniaoId");

-- AddForeignKey
ALTER TABLE "reuniao_projeto" ADD CONSTRAINT "reuniao_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ata_versao" ADD CONSTRAINT "ata_versao_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "reuniao_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ata_item" ADD CONSTRAINT "ata_item_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "ata_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencia_cliente" ADD CONSTRAINT "pendencia_cliente_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "reuniao_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_da_ata" ADD CONSTRAINT "tarefa_da_ata_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "reuniao_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivo_ata" ADD CONSTRAINT "arquivo_ata_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "reuniao_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- No máximo UM rascunho e UMA versão publicada por reunião (fora do schema.prisma, como os outros índices parciais).
CREATE UNIQUE INDEX "ata_versao_um_rascunho" ON "ata_versao" ("reuniaoId") WHERE "estado" = 'rascunho';
CREATE UNIQUE INDEX "ata_versao_uma_publicada" ON "ata_versao" ("reuniaoId") WHERE "estado" = 'publicada';
