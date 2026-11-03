-- Título do link público de certidões (2026-11-03): rótulo interno para diferenciar o objetivo do envio
-- (órgão/cliente). Coluna opcional, sem backfill: links antigos seguem sem título.
ALTER TABLE "link_publico_certidoes" ADD COLUMN "titulo" TEXT;
