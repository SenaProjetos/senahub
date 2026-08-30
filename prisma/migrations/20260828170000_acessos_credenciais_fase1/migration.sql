-- Acessos e Credenciais — Fase 1 (schema base do cofre corporativo).
-- Aditiva: 5 tabelas novas, nenhuma coluna/tabela existente alterada.
-- Plano: docs/contas/plans/acessos-credenciais-plan.md · Spec: docs/contas/specs/acessos-credenciais.md

-- CreateTable
CREATE TABLE "credencial_categoria" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "icone" VARCHAR(50),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credencial_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "nomeCompleto" VARCHAR(255),
    "categoriaId" TEXT NOT NULL,
    "estado" VARCHAR(2),
    "descricao" TEXT,
    "url" VARCHAR(2000),
    "usuarioEncriptado" VARCHAR(500),
    "senhaEncriptada" TEXT,
    "responsavelId" TEXT,
    "departamento" VARCHAR(100),
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "vencimentoEm" DATE,
    "proximaRevisaoEm" DATE,
    "ultimaRevisaoEm" TIMESTAMP(3),
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "fornecedor" VARCHAR(255),
    "tipoLicenca" VARCHAR(100),
    "numeroLicenca" VARCHAR(255),
    "assentos" INTEGER,
    "dataContratacao" DATE,
    "dataRenovacao" DATE,
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPorId" TEXT,

    CONSTRAINT "credencial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial_compartilhamento" (
    "id" TEXT NOT NULL,
    "credencialId" TEXT NOT NULL,
    "tipoAlvo" VARCHAR(50) NOT NULL,
    "alvoId" TEXT NOT NULL,
    "podeVerCadastro" BOOLEAN NOT NULL DEFAULT false,
    "podeVerCredencial" BOOLEAN NOT NULL DEFAULT false,
    "podeEditar" BOOLEAN NOT NULL DEFAULT false,
    "podeGerenciarPermissoes" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credencial_compartilhamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial_projeto" (
    "credencialId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,

    CONSTRAINT "credencial_projeto_pkey" PRIMARY KEY ("credencialId","projetoId")
);

-- CreateTable
CREATE TABLE "credencial_tag" (
    "credencialId" TEXT NOT NULL,
    "tag" VARCHAR(100) NOT NULL,

    CONSTRAINT "credencial_tag_pkey" PRIMARY KEY ("credencialId","tag")
);

-- CreateIndex
CREATE UNIQUE INDEX "credencial_categoria_nome_key" ON "credencial_categoria"("nome");

-- CreateIndex
CREATE INDEX "credencial_categoriaId_idx" ON "credencial"("categoriaId");

-- CreateIndex
CREATE INDEX "credencial_responsavelId_idx" ON "credencial"("responsavelId");

-- CreateIndex
CREATE INDEX "credencial_status_idx" ON "credencial"("status");

-- CreateIndex
CREATE INDEX "credencial_vencimentoEm_idx" ON "credencial"("vencimentoEm");

-- CreateIndex
CREATE INDEX "credencial_deletadoEm_idx" ON "credencial"("deletadoEm");

-- CreateIndex
CREATE INDEX "credencial_compartilhamento_credencialId_idx" ON "credencial_compartilhamento"("credencialId");

-- CreateIndex
CREATE INDEX "credencial_compartilhamento_tipoAlvo_idx" ON "credencial_compartilhamento"("tipoAlvo");

-- CreateIndex
CREATE UNIQUE INDEX "credencial_compartilhamento_credencialId_tipoAlvo_alvoId_key" ON "credencial_compartilhamento"("credencialId", "tipoAlvo", "alvoId");

-- CreateIndex
CREATE INDEX "credencial_projeto_projetoId_idx" ON "credencial_projeto"("projetoId");

-- CreateIndex
CREATE INDEX "credencial_tag_tag_idx" ON "credencial_tag"("tag");

-- AddForeignKey
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "credencial_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_compartilhamento" ADD CONSTRAINT "credencial_compartilhamento_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "credencial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_projeto" ADD CONSTRAINT "credencial_projeto_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "credencial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_projeto" ADD CONSTRAINT "credencial_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_tag" ADD CONSTRAINT "credencial_tag_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "credencial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
