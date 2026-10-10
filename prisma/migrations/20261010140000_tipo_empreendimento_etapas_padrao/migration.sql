-- Etapas padrão POR TIPO de empreendimento, editáveis na tela (substitui a flag semEstudoPreliminar, que nunca foi a produção).
ALTER TABLE "tipo_empreendimento" ADD COLUMN "etapasPadraoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Quem estava marcado "sem Estudo Preliminar" passa a ter Básico e Executivo explícitos (ids das fases globais do catálogo).
UPDATE "tipo_empreendimento"
SET "etapasPadraoIds" = ARRAY(
  SELECT p."id" FROM "prancha_catalogo" p
  WHERE p."categoria" = 'fase' AND p."projetoId" IS NULL AND p."sigla" IN ('BS', 'EX')
  ORDER BY p."ordem"
)
WHERE "semEstudoPreliminar" = true;

ALTER TABLE "tipo_empreendimento" DROP COLUMN "semEstudoPreliminar";
