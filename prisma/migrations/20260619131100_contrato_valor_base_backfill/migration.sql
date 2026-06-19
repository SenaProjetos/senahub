-- Backfill: contratos sem base herdam o valorHomologado atual como base inicial
-- (idempotente). Garante que o denominador do % de acréscimo de aditivo seja o
-- valor inicial mesmo em deploys onde a coluna foi adicionada a dados existentes.
UPDATE "contrato_licitacao" SET "valorHomologadoBase" = "valorHomologado" WHERE "valorHomologadoBase" IS NULL;
