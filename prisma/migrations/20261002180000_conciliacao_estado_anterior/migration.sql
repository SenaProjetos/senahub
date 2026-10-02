-- N4 (núcleo do Financeiro): desconciliar devolve o lançamento ao estado de antes da conciliação.
ALTER TABLE "transacao_bancaria" ADD COLUMN IF NOT EXISTS "estadoAnterior" JSONB;
