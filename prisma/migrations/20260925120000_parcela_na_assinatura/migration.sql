-- F7.3 — "na assinatura" explícito na parcela de contrato por entrega.
--
-- Antes, parcela sem marco era "na assinatura". Com `marcoId` em SET NULL, apagar a linha da EAP
-- transformava a parcela em cobrança imediata sem ninguém pedir. Agora sem marco = sem data.
-- O UPDATE preserva o sentido das linhas que já existirem (sem marco eram "na assinatura").

-- AlterTable
ALTER TABLE "contrato_parcela_entrega" ADD COLUMN     "naAssinatura" BOOLEAN NOT NULL DEFAULT false;

UPDATE "contrato_parcela_entrega" SET "naAssinatura" = true WHERE "marcoId" IS NULL;
