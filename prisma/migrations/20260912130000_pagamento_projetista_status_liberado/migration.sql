-- Índice do recorte da tela Produção (G4/D40): filtro por status + período de liberação,
-- ordenação padrão (status, liberadoEm DESC). Os índices que já existiam cobrem outros
-- caminhos — `[projetistaId, status]` (extrato do projetista), `[disciplinaId]` (sincronização
-- vinda da disciplina) e `[folhaId]` (conteúdo do lote) — nenhum deles serve a este.
--
-- POR QUE AGORA, com 15 linhas em produção: nesse tamanho o Postgres escolhe seq scan de
-- qualquer jeito, então o ganho hoje é zero. O custo também é (tabela minúscula), e o valor é
-- não descobrir a falta do índice quando a tabela já estiver grande e a tela lenta.
--
-- Sem CONCURRENTLY de propósito: migration do Prisma roda em transação, e CREATE INDEX
-- CONCURRENTLY não pode. Com esta tabela o lock de escrita dura milissegundos. Se um dia ela
-- crescer muito, um índice novo deve ser criado à mão com CONCURRENTLY, fora da migration.
CREATE INDEX IF NOT EXISTS "pagamento_projetista_status_liberadoEm_idx"
  ON "pagamento_projetista" ("status", "liberadoEm");
