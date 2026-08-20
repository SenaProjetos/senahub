-- CRM Fase 2 (F2.3): `Lead` v2 — funil de prospecção vira enum fixo + junção com contatos.
--
-- ADITIVA. Nada é apagado: `etapaId`/`FunilEtapa`, `arquivado` e `motivoPerda` continuam
-- existindo e populados, agora DEPRECADOS (02-schema.md §8.3) — o histórico pré-migração fica
-- legível até o CONTRACT. `FunilEtapa` segue no schema, órfã.
--
-- `status` nasce NOT NULL COM DEFAULT, que é o que permite adicioná-la numa tabela populada: as
-- 8 linhas existentes recebem 'IDENTIFICADO' na própria migration. Reclassificar cada uma para o
-- estágio real é trabalho manual da F2.18, junto com `needsReview = true`.
--
-- ⚠️ `clienteId` NÃO é fechado para NOT NULL aqui, embora o ADR-01 diga "obrigatório".
-- Medido em 2026-08-20: 8 de 8 leads têm `clienteId = NULL`, porque `criarLead` nunca preencheu
-- esse campo (não está sequer no `criarLeadSchema`) — ele só é setado na conversão para cliente.
-- Um `SET NOT NULL` aqui abortaria o deploy com "column contains null values". A obrigatoriedade
-- fica na camada de aplicação (mesmo padrão já decidido para `Proposta.negociacaoId`), a F2.18
-- preenche os 8 à mão, e só então uma migration de CONTRACT pode fechar a coluna.

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "status" "StatusProspeccao" NOT NULL DEFAULT 'IDENTIFICADO',
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lead_contato" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lead_contato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_contato_leadId_contatoId_key" ON "lead_contato"("leadId", "contatoId");

-- CreateIndex
CREATE INDEX "lead_contato_contatoId_idx" ON "lead_contato"("contatoId");

-- CreateIndex
CREATE INDEX "lead_clienteId_idx" ON "lead"("clienteId");

-- CreateIndex
CREATE INDEX "lead_status_idx" ON "lead"("status");

-- CreateIndex
CREATE INDEX "lead_createdAt_idx" ON "lead"("createdAt");

-- AddForeignKey
ALTER TABLE "lead_contato" ADD CONSTRAINT "lead_contato_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_contato" ADD CONSTRAINT "lead_contato_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contato_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
