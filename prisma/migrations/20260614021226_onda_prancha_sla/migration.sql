-- AlterTable
ALTER TABLE "disciplina" ADD COLUMN     "entregueEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "prancha" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "revisao" TEXT,
    "escala" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prancha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prancha_disciplinaId_idx" ON "prancha"("disciplinaId");

-- AddForeignKey
ALTER TABLE "prancha" ADD CONSTRAINT "prancha_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
