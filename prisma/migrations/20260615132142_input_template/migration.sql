-- CreateTable
CREATE TABLE "input_template" (
    "id" TEXT NOT NULL,
    "disciplina" TEXT,
    "pergunta" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "input_template_disciplina_idx" ON "input_template"("disciplina");
