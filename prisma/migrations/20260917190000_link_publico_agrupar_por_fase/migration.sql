-- Pastas por fase na página do cliente: quem cria o link decide se agrupa por fase.
-- DEFAULT true = comportamento de hoje para todo link já existente.
ALTER TABLE "link_publico_arquivos"
  ADD COLUMN IF NOT EXISTS "agruparPorFase" BOOLEAN NOT NULL DEFAULT true;
