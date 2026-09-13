-- Recibo de pagamento de produção, assinado pelo projetista dentro do sistema (G5/D36),
-- e o vínculo opcional da NF do PJ com o recibo do mês (pedido do dono, 2026-09-12).
--
-- Escrita à mão, e não por `prisma migrate diff`: o banco de dev é compartilhado com outra
-- branch, e o diff tentaria reverter as migrations dela.

CREATE TYPE "TipoRecibo" AS ENUM ('individual', 'mensal');

CREATE TABLE "recibo_projetista" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRecibo" NOT NULL,
    "projetistaId" TEXT NOT NULL,
    "ano" INTEGER,
    "mes" INTEGER,
    "valor" DECIMAL(14,2) NOT NULL,
    -- O texto EXATO que o projetista leu ao assinar, e o SHA-256 dele: mesma prova do aceite
    -- de Termos de Uso. Guardar só o hash não permitiria reexibir o documento assinado.
    "texto" TEXT NOT NULL,
    "textoHash" TEXT NOT NULL,
    "geradoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assinadoEm" TIMESTAMP(3),
    "assinanteId" TEXT,

    CONSTRAINT "recibo_projetista_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibo_projetista_item" (
    "id" TEXT NOT NULL,
    "reciboId" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,

    CONSTRAINT "recibo_projetista_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recibo_projetista_projetistaId_assinadoEm_idx" ON "recibo_projetista" ("projetistaId", "assinadoEm");
CREATE INDEX "recibo_projetista_ano_mes_idx" ON "recibo_projetista" ("ano", "mes");
CREATE UNIQUE INDEX "recibo_projetista_item_reciboId_pagamentoId_key" ON "recibo_projetista_item" ("reciboId", "pagamentoId");
CREATE INDEX "recibo_projetista_item_pagamentoId_idx" ON "recibo_projetista_item" ("pagamentoId");

ALTER TABLE "recibo_projetista" ADD CONSTRAINT "recibo_projetista_projetistaId_fkey"
  FOREIGN KEY ("projetistaId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo_projetista" ADD CONSTRAINT "recibo_projetista_geradoPorId_fkey"
  FOREIGN KEY ("geradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo_projetista" ADD CONSTRAINT "recibo_projetista_assinanteId_fkey"
  FOREIGN KEY ("assinanteId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recibo_projetista_item" ADD CONSTRAINT "recibo_projetista_item_reciboId_fkey"
  FOREIGN KEY ("reciboId") REFERENCES "recibo_projetista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recibo_projetista_item" ADD CONSTRAINT "recibo_projetista_item_pagamentoId_fkey"
  FOREIGN KEY ("pagamentoId") REFERENCES "pagamento_projetista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NF do PJ referente ao recibo. Coluna nova e NULA: nenhuma NF existente é tocada.
ALTER TABLE "nota_fiscal_pj" ADD COLUMN "reciboId" TEXT;
CREATE INDEX "nota_fiscal_pj_reciboId_idx" ON "nota_fiscal_pj" ("reciboId");
ALTER TABLE "nota_fiscal_pj" ADD CONSTRAINT "nota_fiscal_pj_reciboId_fkey"
  FOREIGN KEY ("reciboId") REFERENCES "recibo_projetista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
