-- CertidaoTipo: flag de tipo obrigatorio (checklist de compliance)
ALTER TABLE "certidao_tipo" ADD COLUMN "obrigatoria" BOOLEAN NOT NULL DEFAULT false;

-- Certidao: responsavel (accountability) opcional
ALTER TABLE "certidao" ADD COLUMN "responsavelId" TEXT;
CREATE INDEX "certidao_responsavelId_idx" ON "certidao"("responsavelId");
ALTER TABLE "certidao" ADD CONSTRAINT "certidao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CertidaoVersao: mimeType real (evita adivinhar Content-Type por sufixo no download)
ALTER TABLE "certidao_versao" ADD COLUMN "mimeType" TEXT;

-- Link publico (sem login) somente-leitura de certidoes, para terceiros (contador, advogado)
CREATE TABLE "link_publico_certidoes" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "certidaoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_publico_certidoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "link_publico_certidoes_token_key" ON "link_publico_certidoes"("token");
