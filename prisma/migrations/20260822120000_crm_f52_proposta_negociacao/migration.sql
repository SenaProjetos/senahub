-- CRM Fase 5 (F5.2, ADR-21): `Proposta` passa a saber de qual `Negociacao` nasceu.
--
-- 100% ADITIVO, e deliberadamente TÍMIDO. Esta migration só abre a coluna — ela NÃO faz o
-- backfill (isso é `scripts/migrar-proposta-negociacao-f52.ts`, rodado à mão, com dry-run) e
-- NÃO toca em nada que já existe na tabela.
--
-- ── Por que NULLABLE, e por que continua nullable para sempre (ADR-21 item 1) ──────────────
-- A obrigatoriedade "toda proposta NOVA tem negociação" vive na validação da action (F5.3),
-- não numa constraint. `NOT NULL` exigiria um backfill perfeito ANTES desta migration rodar e
-- travaria qualquer proposta histórica que não resolvesse — pondo em risco justamente o
-- registro que não pode quebrar. A garantia que importa é a mesma; o risco, não.
--
-- ── O que esta migration NÃO pode encostar (03-migracao.md §7) ─────────────────────────────
-- `numero`, `token`, `ano`, `sequencial` e `proposta_sequencia` ficam intactos. O token está em
-- links já enviados a clientes reais e o `numero` é a identidade contábil do documento; o PDF,
-- por sua vez, é um re-render ao vivo da página pública (`/a/proposta/[token]`), então nem a
-- rota nem a página são tocadas aqui.
--
-- ── ON DELETE SET NULL ────────────────────────────────────────────────────────────────────
-- Padrão do Prisma para FK opcional, e o correto aqui: apagar uma negociação nunca pode levar
-- junto a proposta emitida a partir dela. A proposta é o documento; a negociação, o contexto.

-- AlterTable
ALTER TABLE "proposta" ADD COLUMN     "negociacaoId" TEXT;

-- CreateIndex
CREATE INDEX "proposta_negociacaoId_idx" ON "proposta"("negociacaoId");

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "negociacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
