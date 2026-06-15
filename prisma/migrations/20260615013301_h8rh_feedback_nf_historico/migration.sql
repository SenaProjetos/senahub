-- CreateTable
CREATE TABLE "nota_fiscal_pj_historico" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT NOT NULL,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_fiscal_pj_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_rh" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'feedback',
    "conteudo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_rh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nota_fiscal_pj_historico_notaId_idx" ON "nota_fiscal_pj_historico"("notaId");

-- CreateIndex
CREATE INDEX "feedback_rh_userId_idx" ON "feedback_rh"("userId");

-- AddForeignKey
ALTER TABLE "nota_fiscal_pj_historico" ADD CONSTRAINT "nota_fiscal_pj_historico_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_fiscal_pj"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_rh" ADD CONSTRAINT "feedback_rh_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
