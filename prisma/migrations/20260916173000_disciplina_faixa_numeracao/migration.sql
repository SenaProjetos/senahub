-- Faixa de numeração pra reconhecer disciplina pela numeração do arquivo (motor de
-- nomenclatura, 2026-09-16). `numeracao` (número-base já existente) não basta: as faixas do
-- catálogo não são blocos uniformes de 1000 (Arquitetura=3000 tem só 100 números até
-- Acústica=3100; Elétrico=5000 tem 4 sub-faixas de 100 dentro do próprio bloco) — sem um fim
-- explícito não dá pra saber onde uma faixa termina.
--
-- Aditiva: colunas nullable, sem default forçado, sem backfill (o dono preenche as faixas na
-- tela de catálogo depois). `numeracaoInicioProjeto`/`numeracaoFimProjeto` permitem um projeto
-- específico sobrescrever a faixa global só pra ele.

ALTER TABLE "disciplina_catalogo" ADD COLUMN IF NOT EXISTS "numeracaoFim" INTEGER;

ALTER TABLE "disciplina" ADD COLUMN IF NOT EXISTS "numeracaoInicioProjeto" INTEGER;
ALTER TABLE "disciplina" ADD COLUMN IF NOT EXISTS "numeracaoFimProjeto" INTEGER;
