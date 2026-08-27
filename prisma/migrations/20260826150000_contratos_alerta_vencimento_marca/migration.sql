-- Gerenciador de contratos (spec `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`),
-- complemento da Fase A — marca de compare-and-swap do alerta de vencimento, mesmo papel de
-- `Proposta.alertaValidadeEm` (`alertaPropostasExpiradas`, F5.7 do CRM). Nullable, 100% aditivo.
-- Ficou de fora de `20260826140000_contratos_fundacao` (achado só ao escrever o job).

-- AlterTable
ALTER TABLE "documento_juridico" ADD COLUMN     "alertaVencimentoEm" TIMESTAMP(3);
