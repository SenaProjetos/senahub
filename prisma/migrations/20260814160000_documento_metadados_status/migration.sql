-- Metadados do documento lógico + catálogo de status documental (M5 e M6 da Fase 2).
--
-- Até aqui o "documento" só tinha nome de arquivo. A spec (itens 13 e 26) pede título,
-- descrição, fase e status — sendo status um conceito SEPARADO de revisão: "R03" diz qual
-- versão é, "Em análise" diz em que ponto do fluxo ela está.
--
-- Status é tabela, não enum, pelo mesmo motivo de `tarefa_status`: o escritório muda o
-- vocabulário sem precisar de migration. A seed popula os nove valores sugeridos pela spec.
--
-- Tudo aditivo e nullable: nenhuma linha existente é reescrita, e a tela cai no nome do
-- arquivo enquanto ninguém preencher título.

-- CreateTable
CREATE TABLE "documento_status" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "cor" TEXT,
    "final" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "documento_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documento_status_nome_key" ON "documento_status"("nome");

-- AlterTable
ALTER TABLE "documento_disciplina" ADD COLUMN     "titulo" TEXT,
ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "faseId" TEXT,
ADD COLUMN     "statusId" TEXT;

-- CreateIndex
CREATE INDEX "documento_disciplina_faseId_idx" ON "documento_disciplina"("faseId");

-- CreateIndex
CREATE INDEX "documento_disciplina_statusId_idx" ON "documento_disciplina"("statusId");

-- AddForeignKey: SET NULL nos dois — apagar uma fase do catálogo ou um status nunca pode
-- levar o documento junto.
ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "prancha_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "documento_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;
