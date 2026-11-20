-- Referencial da câmera do apontamento 3D: "cena" (mundo do visualizador de quem criou — todos os apontamentos até
-- aqui) ou "modelo" (o do próprio modelo do apontamento — pedido do cliente no 3D). Ver o comentário do schema.
-- AlterTable
ALTER TABLE "apontamento_coordenacao" ADD COLUMN     "referencial" TEXT NOT NULL DEFAULT 'cena';

-- Os apontamentos já criados pelo aceite de um pedido de modelo vieram de marcações no referencial do modelo.
UPDATE "apontamento_coordenacao" a SET "referencial" = 'modelo'
FROM "marcacao_modelo_cliente" m WHERE m."apontamentoId" = a."id";

ALTER TABLE "apontamento_coordenacao" ADD CONSTRAINT "apontamento_coordenacao_referencial_check" CHECK ("referencial" IN ('cena', 'modelo'));
