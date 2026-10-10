-- Aviso "a etapa começa em 2 dias úteis" (reunião de 08/10/2026, decisão 4): uma vez por etapa e data de início.
CREATE TABLE "aviso_etapa_enviado" (
    "id" TEXT NOT NULL,
    "disciplinaEtapaId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_etapa_enviado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "aviso_etapa_enviado_disciplinaEtapaId_inicio_key" ON "aviso_etapa_enviado"("disciplinaEtapaId", "inicio");

ALTER TABLE "aviso_etapa_enviado" ADD CONSTRAINT "aviso_etapa_enviado_disciplinaEtapaId_fkey" FOREIGN KEY ("disciplinaEtapaId") REFERENCES "disciplina_etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
