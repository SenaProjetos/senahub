-- Onda C: nomeia a relacao PermissaoUsuario.concedidoPorId (era escalar sem FK) pra permitir
-- mostrar quem concedeu um override na tela de overrides. Puramente aditiva.
-- Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (Onda C)

-- CreateIndex
CREATE INDEX "permissao_usuario_concedidoPorId_idx" ON "permissao_usuario"("concedidoPorId");

-- AddForeignKey
ALTER TABLE "permissao_usuario" ADD CONSTRAINT "permissao_usuario_concedidoPorId_fkey" FOREIGN KEY ("concedidoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

