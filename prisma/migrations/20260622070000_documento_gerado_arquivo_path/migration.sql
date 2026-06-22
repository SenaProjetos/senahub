-- Caminho do PDF salvo em storage (opcional; setado quando PDF é gerado e salvo automaticamente).
ALTER TABLE "documento_gerado" ADD COLUMN "arquivo_path" TEXT;
