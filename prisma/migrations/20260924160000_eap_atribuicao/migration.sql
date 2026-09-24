-- F5 — Recursos na linha da EAP (D17, D23, D41). Aditiva: tabela e enum novos, nenhum
-- dado existente muda. O preenchimento das linhas que já existem (herança do responsável
-- da disciplina, D22) NÃO é feito aqui — é o script `scripts/herdar-responsaveis-eap.ts`,
-- que usa a mesma regra pura da aplicação em vez de uma segunda implementação em SQL.

-- CreateEnum
CREATE TYPE "PapelEap" AS ENUM ('dir', 'ger', 'coo', 'eng', 'pro', 'mod', 'rev', 'apr');

-- CreateTable
CREATE TABLE "eap_atribuicao" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "userId" TEXT,
    "papel" "PapelEap" NOT NULL DEFAULT 'pro',
    "horasPrevistas" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eap_atribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eap_atribuicao_userId_idx" ON "eap_atribuicao"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "eap_atribuicao_tarefaId_userId_papel_key" ON "eap_atribuicao"("tarefaId", "userId", "papel");

-- AddForeignKey
ALTER TABLE "eap_atribuicao" ADD CONSTRAINT "eap_atribuicao_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_atribuicao" ADD CONSTRAINT "eap_atribuicao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Escritas à mão: o Prisma não expressa nenhuma das três ─────────────────────────────

-- Um responsável principal por linha (D41). Índice PARCIAL: linhas sem principal, e as
-- atribuições não-principais, ficam fora dele.
CREATE UNIQUE INDEX "eap_atribuicao_principal_key" ON "eap_atribuicao"("tarefaId") WHERE "principal";

-- Principal é quem aparece no card e responde pelo prazo: tem de ser pessoa. Perfil
-- ("Projetista Elétrico", sem ninguém escalado) nunca é principal.
ALTER TABLE "eap_atribuicao" ADD CONSTRAINT "eap_atribuicao_principal_pessoa" CHECK (NOT "principal" OR "userId" IS NOT NULL);

ALTER TABLE "eap_atribuicao" ADD CONSTRAINT "eap_atribuicao_horas_nao_negativas" CHECK ("horasPrevistas" >= 0);
