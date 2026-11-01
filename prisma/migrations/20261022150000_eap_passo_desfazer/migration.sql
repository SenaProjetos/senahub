-- CreateTable
CREATE TABLE "eap_passo_desfazer" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "antes" JSONB NOT NULL,
    "depoisImpressao" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eap_passo_desfazer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eap_passo_desfazer_projetoId_userId_createdAt_idx" ON "eap_passo_desfazer"("projetoId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "eap_passo_desfazer" ADD CONSTRAINT "eap_passo_desfazer_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_passo_desfazer" ADD CONSTRAINT "eap_passo_desfazer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
