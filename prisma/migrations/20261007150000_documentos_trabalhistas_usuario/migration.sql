-- Documentos trabalhistas do colaborador (só o CLT precisa; todos opcionais).
ALTER TABLE "user" ADD COLUMN "pis" TEXT,
ADD COLUMN "ctpsNumero" TEXT,
ADD COLUMN "ctpsSerie" TEXT,
ADD COLUMN "tituloEleitor" TEXT,
ADD COLUMN "cnh" TEXT;
