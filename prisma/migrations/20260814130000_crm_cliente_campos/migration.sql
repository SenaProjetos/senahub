-- CRM Fase 1b (F1.8): Cliente ganha os campos comerciais.
--
-- Aditiva. `status` é NOT NULL mas COM DEFAULT, então as linhas existentes são preenchidas
-- sem erro (a tabela tem 46 registros em produção). Todo o resto é nullable.
--
-- `categoria` (texto livre) NÃO é tocada: fica deprecada em favor de segmentoId/porte, com o
-- conteúdo histórico preservado. Nada é reescrito nem apagado.

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "porte" TEXT,
ADD COLUMN     "salesNavigatorUrl" TEXT,
ADD COLUMN     "segmentoId" TEXT,
ADD COLUMN     "status" "StatusComercialCliente" NOT NULL DEFAULT 'PROSPECT',
ADD COLUMN     "statusOverride" "StatusComercialCliente";

-- CreateIndex
CREATE INDEX "cliente_status_idx" ON "cliente"("status");

-- CreateIndex
CREATE INDEX "cliente_documento_idx" ON "cliente"("documento");

-- CreateIndex
CREATE INDEX "cliente_segmentoId_idx" ON "cliente"("segmentoId");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_segmentoId_fkey" FOREIGN KEY ("segmentoId") REFERENCES "segmento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill do status (ADR-08): quem já tem proposta aceita nasce como CLIENTE, não PROSPECT.
-- Sem isto, todo cliente com contrato fechado apareceria como prospect no primeiro acesso —
-- o default da coluna não sabe olhar o histórico.
-- `statusOverride` fica NULL: ninguém sobrescreveu nada ainda, e EX_CLIENTE/PARCEIRO nunca
-- são inferidos (não há sinal no sistema que os justifique — ver ADR-08).
UPDATE "cliente" SET "status" = 'CLIENTE'
WHERE EXISTS (
  SELECT 1 FROM "proposta" p
  WHERE p."clienteId" = "cliente"."id" AND p."status" = 'aceita'
);
