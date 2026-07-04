-- AlterTable
ALTER TABLE "disciplina_catalogo" ADD COLUMN "categoria" TEXT,
ADD COLUMN "codigo" TEXT,
ADD COLUMN "icone" TEXT,
ADD COLUMN "iconeSvg" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "disciplina_catalogo_codigo_key" ON "disciplina_catalogo"("codigo");
