-- CreateTable
CREATE TABLE "anexo_lead" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexo_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anexo_lead_leadId_idx" ON "anexo_lead"("leadId");

-- AddForeignKey
ALTER TABLE "anexo_lead" ADD CONSTRAINT "anexo_lead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
