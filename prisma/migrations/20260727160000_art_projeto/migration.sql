-- ART/RRT/TRT do projeto, com versionamento (espelha o par certidao/certidao_versao).

CREATE TABLE "art" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "disciplinaId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'ART',
    "numero" TEXT NOT NULL,
    "descricao" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'registrada',
    "emitidaEm" DATE,
    "valor" DECIMAL(10,2),
    "responsavelUserId" TEXT,
    "responsavelNome" TEXT,
    "responsavelRegistro" TEXT,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "art_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "art_versao" (
    "id" TEXT NOT NULL,
    "artId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "numeroArt" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "emitidaEm" DATE,
    "arquivoPath" TEXT,
    "arquivoNome" TEXT,
    "observacao" TEXT,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "art_versao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "art_projetoId_idx" ON "art"("projetoId");
CREATE INDEX "art_disciplinaId_idx" ON "art"("disciplinaId");
CREATE UNIQUE INDEX "art_versao_artId_numero_key" ON "art_versao"("artId", "numero");

ALTER TABLE "art" ADD CONSTRAINT "art_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "art" ADD CONSTRAINT "art_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "art" ADD CONSTRAINT "art_responsavelUserId_fkey" FOREIGN KEY ("responsavelUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "art" ADD CONSTRAINT "art_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "art_versao" ADD CONSTRAINT "art_versao_artId_fkey" FOREIGN KEY ("artId") REFERENCES "art"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "art_versao" ADD CONSTRAINT "art_versao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vínculo do memorial de cálculo com a ART + snapshot do responsável.
ALTER TABLE "calculo_ferramenta" ADD COLUMN "artId" TEXT;
ALTER TABLE "calculo_ferramenta" ADD COLUMN "responsavelNome" TEXT;
ALTER TABLE "calculo_ferramenta" ADD COLUMN "responsavelRegistro" TEXT;
ALTER TABLE "calculo_ferramenta" ADD CONSTRAINT "calculo_ferramenta_artId_fkey" FOREIGN KEY ("artId") REFERENCES "art"("id") ON DELETE SET NULL ON UPDATE CASCADE;
