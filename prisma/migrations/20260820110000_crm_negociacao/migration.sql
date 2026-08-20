-- CRM Fase 2 (F2.4, ADR-04/06/13): nasce `Negociacao` — o estágio que hoje acontece FORA do
-- sistema — mais as junções com contatos e disciplinas, e o gancho em `Projeto`.
--
-- 100% ADITIVA: 3 tabelas novas e 1 coluna nullable em `projeto`. Nada existente é alterado.
-- `Proposta.projetoId` fica INALTERADO, inclusive o `@unique` — é o aceite da tarefa.
--
-- `Negociacao` assume o papel que o model `Oportunidade` pretendia e nunca cumpriu (órfão, sem FK
-- para Lead nem Proposta, 0 linhas em produção). Nome novo de propósito, para não colidir com ele
-- enquanto a tabela velha segue inerte no schema.
--
-- `leadId` é UNIQUE: qualificar o mesmo lead duas vezes passa a ser recusado pelo BANCO, não só
-- pela action (F2.8) — a garantia não depende de ninguém lembrar de checar antes.
--
-- `projeto.negociacaoId` é nullable e assim permanece: todo projeto anterior à reforma, e todo
-- projeto criado fora do funil (que hoje é como o trabalho realmente entra), fica sem negociação.
-- Isso é estado normal, não pendência. ⚠️ Passa a haver um SEGUNDO caminho para "de onde veio
-- esse projeto", ao lado de `Proposta.projetoId` — risco reconhecido em `02-schema.md` §8.5, cuja
-- mitigação é da F5.9 (a transação de aceite grava os dois sempre juntos, com teste dedicado).
--
-- Fecha também a metade pendente da F1.23a: `Negociacao.parceiroId`, que não pôde ser criada
-- naquela tarefa porque o model ainda não existia.

-- CreateTable
CREATE TABLE "negociacao" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "leadId" TEXT,
    "responsavelId" TEXT,
    "tipoEmpreendimentoId" TEXT,
    "areaM2" DECIMAL(12,2),
    "valorEstimado" DECIMAL(14,2),
    "valorProposto" DECIMAL(14,2),
    "valorNegociado" DECIMAL(14,2),
    "desconto" DECIMAL(14,2),
    "probabilidade" INTEGER NOT NULL DEFAULT 0,
    "probabilidadeOverride" BOOLEAN NOT NULL DEFAULT false,
    "temperatura" "Temperatura",
    "estagio" "EstagioNegociacao" NOT NULL DEFAULT 'LEVANTAMENTO',
    "motivoPerdaId" TEXT,
    "concorrente" TEXT,
    "previsaoFechamento" TIMESTAMP(3),
    "dataFechamento" TIMESTAMP(3),
    "canalId" TEXT,
    "campaignId" TEXT,
    "parceiroId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "excluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "negociacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negociacao_contato" (
    "id" TEXT NOT NULL,
    "negociacaoId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "negociacao_contato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negociacao_disciplina" (
    "id" TEXT NOT NULL,
    "negociacaoId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "valor" DECIMAL(14,2),

    CONSTRAINT "negociacao_disciplina_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "projeto" ADD COLUMN     "negociacaoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "negociacao_leadId_key" ON "negociacao"("leadId");

-- CreateIndex
CREATE INDEX "negociacao_clienteId_idx" ON "negociacao"("clienteId");

-- CreateIndex
CREATE INDEX "negociacao_responsavelId_idx" ON "negociacao"("responsavelId");

-- CreateIndex
CREATE INDEX "negociacao_estagio_idx" ON "negociacao"("estagio");

-- CreateIndex
CREATE INDEX "negociacao_dataFechamento_idx" ON "negociacao"("dataFechamento");

-- CreateIndex
CREATE INDEX "negociacao_canalId_idx" ON "negociacao"("canalId");

-- CreateIndex
CREATE INDEX "negociacao_campaignId_idx" ON "negociacao"("campaignId");

-- CreateIndex
CREATE INDEX "negociacao_parceiroId_idx" ON "negociacao"("parceiroId");

-- CreateIndex
CREATE INDEX "negociacao_createdAt_idx" ON "negociacao"("createdAt");

-- CreateIndex
CREATE INDEX "negociacao_excluidoEm_idx" ON "negociacao"("excluidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "negociacao_contato_negociacaoId_contatoId_key" ON "negociacao_contato"("negociacaoId", "contatoId");

-- CreateIndex
CREATE INDEX "negociacao_contato_contatoId_idx" ON "negociacao_contato"("contatoId");

-- CreateIndex
CREATE UNIQUE INDEX "negociacao_disciplina_negociacaoId_disciplinaId_key" ON "negociacao_disciplina"("negociacaoId", "disciplinaId");

-- CreateIndex
CREATE INDEX "negociacao_disciplina_disciplinaId_idx" ON "negociacao_disciplina"("disciplinaId");

-- CreateIndex
CREATE INDEX "projeto_negociacaoId_idx" ON "projeto"("negociacaoId");

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_tipoEmpreendimentoId_fkey" FOREIGN KEY ("tipoEmpreendimentoId") REFERENCES "tipo_empreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "motivo_perda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canal_aquisicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campanha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao" ADD CONSTRAINT "negociacao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "parceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao_contato" ADD CONSTRAINT "negociacao_contato_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "negociacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao_contato" ADD CONSTRAINT "negociacao_contato_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contato_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao_disciplina" ADD CONSTRAINT "negociacao_disciplina_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "negociacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negociacao_disciplina" ADD CONSTRAINT "negociacao_disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "negociacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
