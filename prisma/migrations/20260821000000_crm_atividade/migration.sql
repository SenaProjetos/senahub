-- CRM Fase 3 (F3.1, 02-schema.md §2.10): nasce `Atividade` — timeline unificada do Comercial.
--
-- Substitui `AtividadeLead` + `AtividadeOportunidade`. As duas ficam DEPRECADAS, NÃO apagadas:
-- ambas continuam existindo, populadas, com o histórico pré-migração legível. Nada nesta
-- migration escreve nelas nem lê delas — é aditiva pura, uma tabela nova e mais nada.
--
-- Toda `Atividade` resolve para um `Cliente` (NOT NULL) — é o que permite a timeline da Empresa
-- 360 (F3.7) agregar tudo de uma empresa numa consulta só, em vez de juntar Lead + Negociacao +
-- Proposta em três buscas separadas.
--
-- `leadId`/`negociacaoId`/`propostaId`/`contatoId` são opcionais e SEM CASCADE: apagar um lead
-- não deve apagar o rastro de que ele existiu — daí `ON DELETE SET NULL`, não `CASCADE`.
--
-- `metadata` é para dado narrativo de eventos SISTEMA (ex.: estágio anterior/novo numa mudança de
-- funil) — não é o lugar do valor técnico anterior/novo, que é o `AuditLog` (fronteira definida
-- na F3.3). `registrarAtividade()` (F3.2) é quem vai escrever aqui; esta migration só cria a mesa.

-- CreateTable
CREATE TABLE "atividade" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAtividade" NOT NULL DEFAULT 'NOTA',
    "descricao" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "metadata" JSONB,
    "clienteId" TEXT NOT NULL,
    "contatoId" TEXT,
    "leadId" TEXT,
    "negociacaoId" TEXT,
    "propostaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atividade_clienteId_createdAt_idx" ON "atividade"("clienteId", "createdAt");

-- CreateIndex
CREATE INDEX "atividade_leadId_idx" ON "atividade"("leadId");

-- CreateIndex
CREATE INDEX "atividade_negociacaoId_idx" ON "atividade"("negociacaoId");

-- CreateIndex
CREATE INDEX "atividade_contatoId_idx" ON "atividade"("contatoId");

-- CreateIndex
CREATE INDEX "atividade_propostaId_idx" ON "atividade"("propostaId");

-- AddForeignKey
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contato_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "negociacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "proposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
