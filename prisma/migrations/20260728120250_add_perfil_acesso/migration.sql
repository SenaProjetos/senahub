-- Onda A da separacao Setor x Contratacao x Perfil de acesso: motor de permissao.
-- Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (Onda A)
--
-- ESTRUTURAL APENAS, puramente aditiva. ZERO MUDANCA DE COMPORTAMENTO: `user.perfilId`
-- nasce NULL para todo mundo, e nenhum call-site de autorizacao le estes campos ainda --
-- `role` + `Permissao` continuam sendo a fonte real de autorizacao ate a Onda D fazer o
-- codemod dos call-sites de `can()`. Onda B semeia os perfis reais; Onda C constroi a UI.
--
-- Gerada com `prisma migrate diff` e aplicada via `db push` (sem reset) + `migrate resolve`,
-- seguindo o caminho de drift da skill nova-migracao. O schema tinha trabalho concorrente do
-- modulo Engenharia de Custos (migration 20260728120000_custos_fundacao, aplicada por outra
-- sessao no mesmo banco de dev enquanto esta migration era preparada) -- o diff abaixo foi
-- conferido para conter APENAS as 3 tabelas novas desta onda, nada de Custos.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "perfilId" TEXT,
ADD COLUMN     "superUsuario" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "perfil_acesso" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfil_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissao_perfil" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "permissao_perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissao_usuario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3),
    "concedidoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissao_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_acesso_chave_key" ON "perfil_acesso"("chave");

-- CreateIndex
CREATE INDEX "permissao_perfil_perfilId_idx" ON "permissao_perfil"("perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "permissao_perfil_perfilId_recurso_acao_key" ON "permissao_perfil"("perfilId", "recurso", "acao");

-- CreateIndex
CREATE INDEX "permissao_usuario_userId_idx" ON "permissao_usuario"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "permissao_usuario_userId_recurso_acao_key" ON "permissao_usuario"("userId", "recurso", "acao");

-- CreateIndex
CREATE INDEX "user_perfilId_idx" ON "user"("perfilId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfil_acesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissao_perfil" ADD CONSTRAINT "permissao_perfil_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfil_acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissao_usuario" ADD CONSTRAINT "permissao_usuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

