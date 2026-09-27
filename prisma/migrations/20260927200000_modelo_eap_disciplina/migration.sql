-- Modelos de EAP por disciplina (pedido do dono, 2026-09-27): "Gerar EAP das disciplinas" passa a ler um
-- catálogo de modelos de DISCIPLINA, como o modelo de projeto. Aditiva: coluna nula = modelo de projeto,
-- então todo modelo que já existe continua sendo de projeto.

-- AlterTable
ALTER TABLE "modelo_eap" ADD COLUMN "disciplinaCatalogoId" TEXT;

-- CreateIndex
CREATE INDEX "modelo_eap_disciplinaCatalogoId_idx" ON "modelo_eap"("disciplinaCatalogoId");

-- AddForeignKey
ALTER TABLE "modelo_eap" ADD CONSTRAINT "modelo_eap_disciplinaCatalogoId_fkey" FOREIGN KEY ("disciplinaCatalogoId") REFERENCES "disciplina_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
