-- Onda E, passo 3 de §6.4: escala padrão passa a ser chaveada por CONTRATAÇÃO, não por papel.
-- Puramente ADITIVA: `escala_role` continua existindo e só é dropada no passo 4, depois do
-- ciclo em sombra. Nenhum dado é movido por esta migration — a cópia é feita pelo script
-- `scripts/migrar-escala-contratacao.ts`, que recusa rodar se as grades de administrativo/clt/ti
-- divergirem entre si (as três colapsam no mesmo slot `clt`).
CREATE TABLE "escala_contratacao" (
    "id" TEXT NOT NULL,
    "contratacao" "Contratacao" NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "entrada" TEXT,
    "saida" TEXT,
    "descansos" JSONB NOT NULL DEFAULT '[]',
    "horasDia" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "toleranciaMin" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "escala_contratacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "escala_contratacao_contratacao_diaSemana_key" ON "escala_contratacao"("contratacao", "diaSemana");
