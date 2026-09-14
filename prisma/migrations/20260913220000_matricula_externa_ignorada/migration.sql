-- Gerada via `prisma migrate diff --from-schema <HEAD> --to-schema prisma/schema.prisma --script`
-- (schema-to-schema puro, sem tocar o banco) em vez de `prisma migrate dev`, porque o banco de
-- dev tinha drift de OUTRA sessão concorrente (excludiEm em certidao, índices de pendencia) —
-- resetar teria derrubado trabalho não commitado dela. Aplicada manualmente numa transação
-- (raw pg) e registrada via `prisma migrate resolve --applied`. Ver skill nova-migracao.
--
-- Nova tabela matricula_externa_ignorada (plano 2026-09-13-folha-clt-import-assinatura.md):
-- marca matrícula do contador cujo dono não tem (e não vai ter) usuário no sistema, achado no
-- primeiro import real — sem isto o import travaria pra sempre pedindo cadastro de alguém que
-- nunca vai existir como User.

-- CreateTable
CREATE TABLE "matricula_externa_ignorada" (
    "id" TEXT NOT NULL,
    "matriculaExterna" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matricula_externa_ignorada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "matricula_externa_ignorada_matriculaExterna_key" ON "matricula_externa_ignorada"("matriculaExterna");
