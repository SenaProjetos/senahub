-- Segurança do aceite público: expiração/revogação e evidências da resposta.
-- Colunas nullable para manter a migration aditiva. Links legados sem expiraEm
-- são recusados pela aplicação e recebem nova validade quando regenerados.
ALTER TABLE "aceite_cliente"
  ADD COLUMN "expiraEm" TIMESTAMP(3),
  ADD COLUMN "respondidoIp" TEXT,
  ADD COLUMN "respondidoPor" TEXT,
  ADD COLUMN "respondidoUserAgent" TEXT,
  ADD COLUMN "revogadoEm" TIMESTAMP(3);
