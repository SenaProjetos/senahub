-- Estrutura de pastas por tipo de projeto + pastas personalizadas.

-- Novo tipo de projeto: Laudo.
ALTER TYPE "TipoProjeto" ADD VALUE 'laudo';

-- Disciplina: fluxo de conclusão em 2 passos (aprovação/laudo).
ALTER TABLE "disciplina" ADD COLUMN "aprovacaoSolicitadaEm" TIMESTAMP(3);
ALTER TABLE "disciplina" ADD COLUMN "aprovacaoSolicitadaPorId" TEXT;

-- Upload: pacote passa a ser opcional (nulo quando o arquivo vive numa PastaProjeto).
ALTER TABLE "upload" ALTER COLUMN "pacote" DROP NOT NULL;
ALTER TABLE "upload" ADD COLUMN "pastaId" TEXT;

-- Árvore de pastas por disciplina (template + custom).
CREATE TABLE "pasta_projeto" (
    "id" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "parentId" TEXT,
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'custom',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasta_projeto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pasta_projeto_disciplinaId_parentId_idx" ON "pasta_projeto"("disciplinaId", "parentId");
CREATE INDEX "upload_pastaId_idx" ON "upload"("pastaId");

ALTER TABLE "pasta_projeto" ADD CONSTRAINT "pasta_projeto_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pasta_projeto" ADD CONSTRAINT "pasta_projeto_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "pasta_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload" ADD CONSTRAINT "upload_pastaId_fkey" FOREIGN KEY ("pastaId") REFERENCES "pasta_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
