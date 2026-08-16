-- CRM Fase 1f (F1.23 + F1.23a): Lead ganha atribuicao/origem estruturada + parceiro (indicacao).
--
-- `responsavelId`/`canalId`/`origemDetalhada`/`campaignId` (F1.23) sao SO exibicao/atribuicao
-- ("Meus x Todos", Fase 2) -- NAO sao gate de permissao (ADR-15 revisado, Q4). `parceiroId`
-- (F1.23a, ADR-19) fecha a pendencia #13: indicacao passa a ser referenciada por lista, nunca
-- digitada em texto livre.
--
-- `Campanha` e `Parceiro` nascem VAZIAS -- nao ha dado historico pra migrar (Lead.origem nunca
-- guardou canal de verdade, ver docs/crm/03-migracao.md §3; indicacao nunca foi rastreada). A UI
-- de gestao de Campanha so entra na Fase 4; o CRUD/selecao de Parceiro e a F1.23b.
--
-- ESTE ARQUIVO E SO ESTRUTURA -- de proposito, nenhum backfill aqui. `migrate deploy` roda ANTES
-- de `db:seed` no fluxo padrao de deploy (deploy/gerenciar-servidor.ps1, opcao 10 e o commit
-- automatico), e este e o PRIMEIRO deploy de toda a reforma do CRM: `canal_aquisicao` ainda
-- estaria VAZIO no momento em que esta migration roda, entao um `UPDATE ... WHERE EXISTS
-- (SELECT 1 FROM canal_aquisicao WHERE nome = 'Outro')` aqui faria nada, silenciosamente, e
-- nada re-rodaria depois -- os 8 leads reais perderiam "SMERALDA DEL MARE" etc. de
-- `origemDetalhada` para sempre, exatamente o que docs/crm/03-migracao.md §3 diz que nao pode
-- acontecer ("nada e descartado").
--
-- Todo backfill (canal/origemDetalhada E responsavelId) fica em
-- `scripts/backfill-lead-f123.ts`, rodado manualmente DEPOIS do `db:seed` (que e quando
-- `canal_aquisicao` ja tem a linha "Outro" garantida). `responsavelId` em especial nao daria pra
-- fazer em SQL de migration de qualquer forma: `Lead` nunca teve campo de autor, e `criarLead`
-- (defineAction) nao grava `entidadeId` no AuditLog -- o script correlaciona por PROXIMIDADE DE
-- HORARIO contra `audit_log` (acao='criar-lead', dentro de 30s da criacao do lead) com fallback
-- pra `AtividadeLead.autorId` mais antigo -- conferido contra o dump de producao de 2026-08-14
-- (`senahub_20260814_160401.backup`, restaurado num banco throwaway pra checagem, descartado
-- depois).

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "canalId" TEXT,
ADD COLUMN     "origemDetalhada" TEXT,
ADD COLUMN     "parceiroId" TEXT,
ADD COLUMN     "responsavelId" TEXT;

-- CreateTable
CREATE TABLE "campanha" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "canalId" TEXT,
    "periodoInicio" DATE,
    "periodoFim" DATE,
    "responsavelId" TEXT,
    "meta" DECIMAL(14,2),
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parceiro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'PF',
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "excluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanha_canalId_idx" ON "campanha"("canalId");

-- CreateIndex
CREATE INDEX "campanha_responsavelId_idx" ON "campanha"("responsavelId");

-- CreateIndex
CREATE INDEX "parceiro_excluidoEm_idx" ON "parceiro"("excluidoEm");

-- CreateIndex
CREATE INDEX "lead_responsavelId_idx" ON "lead"("responsavelId");

-- CreateIndex
CREATE INDEX "lead_canalId_idx" ON "lead"("canalId");

-- CreateIndex
CREATE INDEX "lead_campaignId_idx" ON "lead"("campaignId");

-- CreateIndex
CREATE INDEX "lead_parceiroId_idx" ON "lead"("parceiroId");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canal_aquisicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campanha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "parceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha" ADD CONSTRAINT "campanha_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canal_aquisicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha" ADD CONSTRAINT "campanha_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
