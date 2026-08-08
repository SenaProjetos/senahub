-- Item 14: miniatura persistida do recorte da prancha (R6). Nullable e sem backfill — só
-- apontamento com forma (retângulo/nuvem/seta) gera recorte, e nenhum existente tem.
ALTER TABLE "pendencia" ADD COLUMN "thumbPath" TEXT;
