-- Acessos e Credenciais — favoritos por usuário (§41 da spec).
-- Aditiva: 1 tabela nova, nada existente é alterado.
-- Preferência INDIVIDUAL: marcar favorito não muda o que ninguém mais vê, e não concede
-- acesso — a listagem continua filtrada por CredencialCompartilhamento.

-- CreateTable
CREATE TABLE "credencial_favorito" (
    "userId" TEXT NOT NULL,
    "credencialId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credencial_favorito_pkey" PRIMARY KEY ("userId","credencialId")
);

-- CreateIndex
CREATE INDEX "credencial_favorito_credencialId_idx" ON "credencial_favorito"("credencialId");

-- AddForeignKey
ALTER TABLE "credencial_favorito" ADD CONSTRAINT "credencial_favorito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_favorito" ADD CONSTRAINT "credencial_favorito_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "credencial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
