-- Cargo/vínculo pretendido informado no auto-cadastro público (palpite; admin decide na criação).
ALTER TABLE "solicitacao_cadastro" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'cliente';
