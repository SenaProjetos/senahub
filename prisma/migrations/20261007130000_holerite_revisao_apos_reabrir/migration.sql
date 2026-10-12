-- Reabrir a folha revoga a assinatura do holerite; estes campos guardam a assinatura revogada e
-- os itens que ela cobria, para o funcionário ver o que mudou ao assinar de novo.
ALTER TABLE "holerite" ADD COLUMN "assinaturaAnteriorEm" TIMESTAMP(3),
ADD COLUMN "itensAssinadosAntes" JSONB;
