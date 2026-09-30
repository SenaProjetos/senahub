-- Trava do plano depois da aprovação (reunião de 29/09/2026): "Revisar planejamento" abre a edição, a
-- "Nova linha de base" fecha. Aditiva: todo cronograma existente nasce fora de revisão (aprovado = travado).
ALTER TABLE "cronograma_projeto" ADD COLUMN IF NOT EXISTS "emRevisao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cronograma_projeto" ADD COLUMN IF NOT EXISTS "revisaoAbertaEm" TIMESTAMP(3);
ALTER TABLE "cronograma_projeto" ADD COLUMN IF NOT EXISTS "revisaoAlterada" BOOLEAN NOT NULL DEFAULT false;
