-- CRM Fase 5 (F5.13): PDF imutável arquivado por versão enviada.
--
-- Aprovado pelo dono em 2026-08-22 ("melhor pagar o custo de storage e manter alguns PDFs que
-- pesam alguns kb pra preservar o histórico"). A tarefa era OPCIONAL no backlog, com portão
-- próprio, justamente porque troca storage por histórico.
--
-- ── O problema ──────────────────────────────────────────────────────────────────────────────
-- `/api/t/proposta/[token]/pdf` RE-RENDERIZA a página pública a cada download (`page.goto`).
-- Então o PDF baixado amanhã pode diferir do que o cliente recebeu hoje, se os itens mudarem no
-- meio (00-auditoria §E.6). Não há registro do que foi efetivamente enviado.
--
-- ── SEM BACKFILL, e não é omissão ───────────────────────────────────────────────────────────
-- O PDF de uma versão passada é IMPOSSÍVEL de reconstruir: a página pública já mostra outro
-- conteúdo, e é dela que o PDF sai. Gerar agora produziria o documento de HOJE carimbado como
-- se fosse o de então — pior que não ter. `NULL` significa "esta versão não tem PDF congelado",
-- e o download cai no ao-vivo, exatamente como sempre funcionou.

-- AlterTable
ALTER TABLE "proposta_versao" ADD COLUMN     "pdfPath" TEXT,
ADD COLUMN     "pdfHashSha256" TEXT,
ADD COLUMN     "pdfTamanho" INTEGER;
