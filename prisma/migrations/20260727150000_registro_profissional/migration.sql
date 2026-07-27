-- Registro profissional (CREA/CAU/CFT) no cadastro do usuário.
-- Todos opcionais: nenhum cadastro existente precisa de backfill.
ALTER TABLE "user" ADD COLUMN "conselho" TEXT;
ALTER TABLE "user" ADD COLUMN "registroProfissional" TEXT;
ALTER TABLE "user" ADD COLUMN "registroUf" TEXT;
