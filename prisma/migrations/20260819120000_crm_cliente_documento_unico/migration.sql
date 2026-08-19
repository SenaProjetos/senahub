-- F1.16 / ADR-03 — CPF/CNPJ é único APENAS quando preenchido.
--
-- Índice PARCIAL: 18 dos 46 clientes de produção não têm documento (prospect raramente tem o
-- CNPJ à mão — é o motivo de ADR-03 ter rejeitado "exigir CNPJ sempre"). Um índice único comum
-- deixaria só UM cliente sem documento existir; o parcial deixa quantos forem, e trava só a
-- duplicata de valor preenchido.
--
-- ⚠️ PRÉ-REQUISITOS, os dois já executados quando esta migration roda:
--   1. F1.15 (fusão dos 3 grupos duplicados) — é ela que preenche o CNPJ 66403270000151 do grupo
--      Nominal. Criar o índice antes travaria a fusão.
--   2. scripts/normalizar-documento-f116.ts — `documento = ''` NÃO é NULL e seria pego por este
--      predicado; havia 2 clientes PF assim em produção, que colidiriam entre si e fariam este
--      CREATE INDEX abortar. O mesmo script tira a pontuação dos 4 CNPJs pontuados, sem o que o
--      índice existiria mas deixaria o mesmo CNPJ passar duas vezes escrito de jeitos diferentes.
--
-- Não está no `schema.prisma`: o Prisma não expressa índice parcial. Mesmo caso dos índices GIN
-- de `20260621201500_search_indexes`, que seguem o mesmo padrão de SQL cru neste repo.
--
-- NOTA para quem for mexer depois: o predicado NÃO exclui `excluidoEm` nem `fundidoEmId`. Um
-- cliente excluído ou já fundido continua ocupando o documento. É deliberado (é o DDL pedido em
-- ADR-03 e no backlog) e hoje é inofensivo — nenhum cliente arquivado de produção tem documento
-- preenchido. Se um dia recadastrar uma empresa cujo registro antigo foi excluído der erro de
-- duplicata, é aqui que se resolve, estreitando o predicado.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_documento_unico
  ON "cliente" (documento)
  WHERE documento IS NOT NULL;
