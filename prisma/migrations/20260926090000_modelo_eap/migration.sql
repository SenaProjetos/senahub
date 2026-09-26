-- Decisão #5: modelos de EAP importados do MS Project + Tipo de Empreendimento no projeto (D13).
-- Aditiva: tabela, enum e coluna novos; nenhum dado existente muda. `projeto.tipoEmpreendimentoId`
-- nasce NULO — "obrigatório na criação" é regra do formulário, não do banco (não se inventa o tipo
-- de um projeto que já existe).

-- CreateEnum
CREATE TYPE "OrigemModeloEap" AS ENUM ('mspdi', 'projeto');

-- CreateTable
CREATE TABLE "modelo_eap" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipoEmpreendimentoId" TEXT,
    "origem" "OrigemModeloEap" NOT NULL DEFAULT 'mspdi',
    "arquivoNome" TEXT,
    "estrutura" JSONB NOT NULL,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "totalMarcos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_eap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modelo_eap_tipoEmpreendimentoId_idx" ON "modelo_eap"("tipoEmpreendimentoId");

-- AddForeignKey
ALTER TABLE "modelo_eap" ADD CONSTRAINT "modelo_eap_tipoEmpreendimentoId_fkey" FOREIGN KEY ("tipoEmpreendimentoId") REFERENCES "tipo_empreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_eap" ADD CONSTRAINT "modelo_eap_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "projeto" ADD COLUMN "tipoEmpreendimentoId" TEXT;

-- AddForeignKey
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_tipoEmpreendimentoId_fkey" FOREIGN KEY ("tipoEmpreendimentoId") REFERENCES "tipo_empreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice do filtro da lista de projetos por tipo de empreendimento.
CREATE INDEX "projeto_tipoEmpreendimentoId_idx" ON "projeto"("tipoEmpreendimentoId");
