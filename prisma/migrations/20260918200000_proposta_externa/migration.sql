-- ADR-0005: proposta montada fora do sistema (PDF anexado por versão).
-- Aditiva, com DEFAULT: nenhuma proposta existente muda de comportamento.
ALTER TABLE "proposta" ADD COLUMN IF NOT EXISTS "externa" BOOLEAN NOT NULL DEFAULT false;
