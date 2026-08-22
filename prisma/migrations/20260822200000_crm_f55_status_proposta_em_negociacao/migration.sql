-- CRM Fase 5 (F5.5, P14 item 4): `StatusProposta` ganha `em_negociacao`.
--
-- 100% aditivo — só adiciona um valor ao enum do Postgres, nenhuma linha existente muda de
-- status. PostgreSQL 12+ permite `ALTER TYPE ... ADD VALUE` e usar o valor novo na mesma
-- transação/sessão (a restrição de versões antigas não se aplica aqui, PG 17).
--
-- `visualizada` continua de FORA do enum, de propósito (02-schema §8.4) — é o pixel de abertura
-- (`PropostaVisualizacao`, um evento por abertura), não um estado. Esta migration não mexe nela.

-- AlterEnum
ALTER TYPE "StatusProposta" ADD VALUE 'em_negociacao';
