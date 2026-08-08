-- Item 18: prazo/SLA por apontamento. Data FIXA definida na criação (R8) — não há tabela de
-- regra por severidade. Aditiva: linha existente fica sem prazo, que é o estado correto (elas
-- nunca tiveram um).
ALTER TABLE "pendencia" ADD COLUMN "prazo" TIMESTAMP(3);

-- O job diário varre por prazo entre os publicados e ainda em aberto.
CREATE INDEX "pendencia_prazo_idx" ON "pendencia"("prazo");
