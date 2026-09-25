-- F8 — a linha de base guarda se a linha era AGRUPAMENTO no congelamento. O Valor Agregado soma
-- só as folhas; sem isto a baseline (que guarda os resumos com horas e custo já somados) contaria
-- cada trabalho duas vezes.
--
-- Backfill das baselines que já existem: pela árvore ATUAL (melhor informação disponível). Em
-- produção nenhum cronograma estava aprovado antes deste deploy, então só o dev tem o que acertar.

-- AlterTable
ALTER TABLE "eap_baseline_linha" ADD COLUMN     "resumo" BOOLEAN NOT NULL DEFAULT false;

UPDATE "eap_baseline_linha" AS bl
   SET "resumo" = true
 WHERE EXISTS (SELECT 1 FROM "eap_tarefa" t WHERE t."parentId" = bl."tarefaId");
