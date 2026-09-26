-- Âncora do cronograma: a "Data de Início do Projeto" do MS Project.
--
-- Sem ela o motor não tem de onde partir para uma linha sem predecessora e sem restrição,
-- e o único fallback seria "hoje" — o que faz o cronograma inteiro andar sozinho a cada dia
-- que passa, inclusive o de um projeto já aprovado. É também o único dado que aplicar um
-- modelo de EAP pede (o modelo guarda só duração e predecessora).
--
-- Aditiva e nullable: cronograma herdado entra sem âncora e a F2 a pede na aprovação.

ALTER TABLE "cronograma_projeto" ADD COLUMN IF NOT EXISTS "inicioProjeto" DATE;

-- Cronograma que já existe recebe como âncora o menor início previsto da sua EAP: é a
-- leitura mais fiel do que o coordenador já tinha em mente, e evita que a primeira
-- reprogramação jogue o projeto para hoje.
UPDATE "cronograma_projeto" c
   SET "inicioProjeto" = sub.menor
  FROM (
        SELECT "projetoId", MIN("inicioPrevisto")::date AS menor
          FROM "eap_tarefa"
         GROUP BY "projetoId"
       ) sub
 WHERE sub."projetoId" = c."projetoId"
   AND c."inicioProjeto" IS NULL;
