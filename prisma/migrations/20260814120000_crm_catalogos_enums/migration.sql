-- CRM Fase 1b (F1.5): vocabulário do módulo Comercial — catálogos e enums.
--
-- Puramente ADITIVA: cria tipos e tabelas novas, não altera/renomeia/remove nada existente.
-- O sistema atual continua funcionando sem qualquer mudança de comportamento.
--
-- Os models que consomem este vocabulário (Negociacao, Lead v2, Campanha, Cliente v2) chegam
-- nas tarefas seguintes — é lá que entram as FKs e seus índices.
--
-- Disciplina NÃO entra aqui: `disciplina_catalogo` já é o catálogo do sistema (20 entradas
-- seedadas). Ver docs/crm/02-schema.md §8.1.
--
-- Catálogos nascem VAZIOS; o seed idempotente os popula (F1.6). `canal_aquisicao` em especial
-- não tem de-para a partir do `lead.origem` atual, que foi preenchido com nome de
-- empreendimento em vez de canal — ver docs/crm/03-migracao.md §3.

-- CreateEnum
CREATE TYPE "StatusProspeccao" AS ENUM ('IDENTIFICADO', 'CONTATO_INICIADO', 'EM_CONTATO', 'QUALIFICADO', 'OPORTUNIDADE_CRIADA', 'SEM_OPORTUNIDADE', 'EM_ESPERA', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "EstagioNegociacao" AS ENUM ('LEVANTAMENTO', 'ORCAMENTO', 'PROPOSTA_ENVIADA', 'NEGOCIACAO', 'CONTRATADO', 'PERDIDO', 'EM_ESPERA', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Temperatura" AS ENUM ('FRIO', 'MORNO', 'QUENTE');

-- CreateEnum
CREATE TYPE "TipoAtividade" AS ENUM ('LIGACAO', 'WHATSAPP', 'EMAIL', 'LINKEDIN', 'REUNIAO', 'NOTA', 'ANEXO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "StatusComercialCliente" AS ENUM ('PROSPECT', 'CLIENTE', 'EX_CLIENTE', 'PARCEIRO');

-- CreateEnum
CREATE TYPE "BaseLegalLgpd" AS ENUM ('LEGITIMO_INTERESSE');

-- CreateEnum
CREATE TYPE "StatusRelacionamentoContato" AS ENUM ('ATIVO', 'AFASTADO', 'SAIU_DA_EMPRESA');

-- CreateTable
CREATE TABLE "tipo_empreendimento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tipo_empreendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivo_perda" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "exigeConcorrente" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "motivo_perda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal_aquisicao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "canal_aquisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "segmento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probabilidade_estagio" (
    "estagio" "EstagioNegociacao" NOT NULL,
    "probabilidade" INTEGER NOT NULL,

    CONSTRAINT "probabilidade_estagio_pkey" PRIMARY KEY ("estagio")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_empreendimento_nome_key" ON "tipo_empreendimento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_perda_nome_key" ON "motivo_perda"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "canal_aquisicao_nome_key" ON "canal_aquisicao"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "segmento_nome_key" ON "segmento"("nome");
