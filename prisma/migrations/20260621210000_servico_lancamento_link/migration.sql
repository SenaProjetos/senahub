-- Vínculo do serviço terceirizado com o Financeiro (despesa prevista/confirmada).
ALTER TABLE "servico_terceirizado" ADD COLUMN "lancamentoId" TEXT;

CREATE UNIQUE INDEX "servico_terceirizado_lancamentoId_key" ON "servico_terceirizado"("lancamentoId");
