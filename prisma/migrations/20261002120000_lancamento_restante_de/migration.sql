-- N1 (núcleo do Financeiro): o resto de um pagamento parcial aponta para o lançamento pago em parte,
-- para o estorno do pago levar junto o resto ainda em aberto. Aditiva; restos antigos ficam sem vínculo
-- (o estorno os acha pelo `recorrenciaGrupo` quando dá, e avisa quando não dá).
ALTER TABLE "lancamento" ADD COLUMN IF NOT EXISTS "restanteDeId" TEXT;

CREATE INDEX IF NOT EXISTS "lancamento_restanteDeId_idx" ON "lancamento"("restanteDeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamento_restanteDeId_fkey') THEN
    ALTER TABLE "lancamento"
      ADD CONSTRAINT "lancamento_restanteDeId_fkey" FOREIGN KEY ("restanteDeId") REFERENCES "lancamento"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
