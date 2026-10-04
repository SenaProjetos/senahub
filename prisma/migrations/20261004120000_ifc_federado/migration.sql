-- IFC federado (spec docs/superpowers/specs/2026-10-04-ifc-federado-design.md). Aditiva.

-- AlterEnum
ALTER TYPE "OrigemDocumento" ADD VALUE 'modelo_federado';

-- CreateTable
CREATE TABLE "geracao_modelo_federado" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "composicao" JSONB NOT NULL,
    "erro" TEXT,
    "avisos" JSONB,
    "documentoVersaoId" TEXT,
    "autorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    CONSTRAINT "geracao_modelo_federado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geracao_modelo_federado_documentoVersaoId_key" ON "geracao_modelo_federado"("documentoVersaoId");
CREATE INDEX "geracao_modelo_federado_projetoId_criadoEm_idx" ON "geracao_modelo_federado"("projetoId", "criadoEm");

-- Uma geração viva por projeto: dois cliques simultâneos não criam duas (o segundo leva P2002).
CREATE UNIQUE INDEX "geracao_modelo_federado_uma_viva_por_projeto"
    ON "geracao_modelo_federado"("projetoId") WHERE "status" IN ('fila', 'processando');

ALTER TABLE "geracao_modelo_federado" ADD CONSTRAINT "geracao_modelo_federado_projetoId_fkey"
    FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geracao_modelo_federado" ADD CONSTRAINT "geracao_modelo_federado_documentoVersaoId_fkey"
    FOREIGN KEY ("documentoVersaoId") REFERENCES "documento_versao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "geracao_modelo_federado" ADD CONSTRAINT "geracao_modelo_federado_autorId_fkey"
    FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
