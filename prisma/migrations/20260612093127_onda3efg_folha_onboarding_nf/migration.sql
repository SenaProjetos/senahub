-- CreateEnum
CREATE TYPE "TipoRubrica" AS ENUM ('provento', 'desconto');

-- CreateEnum
CREATE TYPE "StatusFolha" AS ENUM ('aberta', 'fechada');

-- CreateEnum
CREATE TYPE "StatusNF" AS ENUM ('enviada', 'aprovada', 'rejeitada');

-- CreateTable
CREATE TABLE "rubrica_folha" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoRubrica" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rubrica_folha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folha_pagamento" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "status" "StatusFolha" NOT NULL DEFAULT 'aberta',
    "fechadaEm" TIMESTAMP(3),
    "lancamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folha_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holerite" (
    "id" TEXT NOT NULL,
    "folhaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "holerite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holerite_item" (
    "id" TEXT NOT NULL,
    "holeriteId" TEXT NOT NULL,
    "rubricaId" TEXT,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoRubrica" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "holerite_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "onboarding_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_item" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onboarding_template_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_processo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_item" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "onboarding_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_fiscal_pj" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "numero" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "arquivoPath" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "status" "StatusNF" NOT NULL DEFAULT 'enviada',
    "observacao" TEXT,
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_fiscal_pj_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubrica_folha_nome_key" ON "rubrica_folha"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "folha_pagamento_lancamentoId_key" ON "folha_pagamento"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "folha_pagamento_ano_mes_key" ON "folha_pagamento"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "holerite_folhaId_userId_key" ON "holerite"("folhaId", "userId");

-- CreateIndex
CREATE INDEX "holerite_item_holeriteId_idx" ON "holerite_item"("holeriteId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_template_nome_key" ON "onboarding_template"("nome");

-- CreateIndex
CREATE INDEX "onboarding_template_item_templateId_idx" ON "onboarding_template_item"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_processo_userId_key" ON "onboarding_processo"("userId");

-- CreateIndex
CREATE INDEX "onboarding_item_processoId_idx" ON "onboarding_item"("processoId");

-- CreateIndex
CREATE INDEX "nota_fiscal_pj_userId_status_idx" ON "nota_fiscal_pj"("userId", "status");

-- AddForeignKey
ALTER TABLE "holerite" ADD CONSTRAINT "holerite_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "folha_pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holerite" ADD CONSTRAINT "holerite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holerite_item" ADD CONSTRAINT "holerite_item_holeriteId_fkey" FOREIGN KEY ("holeriteId") REFERENCES "holerite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holerite_item" ADD CONSTRAINT "holerite_item_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "rubrica_folha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_item" ADD CONSTRAINT "onboarding_template_item_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_processo" ADD CONSTRAINT "onboarding_processo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_processo" ADD CONSTRAINT "onboarding_processo_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_item" ADD CONSTRAINT "onboarding_item_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "onboarding_processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_fiscal_pj" ADD CONSTRAINT "nota_fiscal_pj_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_fiscal_pj" ADD CONSTRAINT "nota_fiscal_pj_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
