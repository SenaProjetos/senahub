-- Pool de recursos, parte 6: parceiro externo com nome (decisão 4).
CREATE TABLE "parceiro_externo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "disciplinaId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parceiro_externo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parceiro_externo_disciplinaId_idx" ON "parceiro_externo"("disciplinaId");

-- Nome único sem diferença de maiúscula nem espaço nas pontas (fora do schema.prisma).
CREATE UNIQUE INDEX "parceiro_externo_nome_unico" ON "parceiro_externo"(lower(btrim("nome")));

ALTER TABLE "parceiro_externo" ADD CONSTRAINT "parceiro_externo_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "eap_atribuicao" ADD COLUMN "parceiroId" TEXT;

CREATE INDEX "eap_atribuicao_parceiroId_idx" ON "eap_atribuicao"("parceiroId");

ALTER TABLE "eap_atribuicao" ADD CONSTRAINT "eap_atribuicao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "parceiro_externo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O parceiro só nomeia a etapa de terceiro.
ALTER TABLE "eap_atribuicao" ADD CONSTRAINT "eap_atribuicao_parceiro_so_externo" CHECK ("parceiroId" IS NULL OR "papel" = 'ext');
