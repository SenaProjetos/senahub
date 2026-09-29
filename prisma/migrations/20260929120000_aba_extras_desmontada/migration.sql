-- Aba "Extras" (Mais) do projeto desmontada (2026-09-29, decisão do dono).
-- Riscos e Acessos foram para a Visão Geral, a composição de preço para a aba Financeiro e a
-- solicitação de revisão passou a nascer do envio de apontamentos. LM, linha de base antiga
-- (substituída pela baseline do motor de cronograma, `eap_baseline`) e checklist saíram.
--
-- Conferido antes desta migração: as tabelas abaixo estavam VAZIAS em produção e no dev.
-- Seguro no mesmo deploy do código: os dois deploys (menu e automático) param o serviço antes
-- do `migrate deploy`, então nenhum processo com o código antigo roda depois do DROP.
-- `IF EXISTS` para o caso de alguém ter apagado à mão antes (ver deploy de 2026-08-30).

DROP TABLE IF EXISTS "lm_config";
DROP TABLE IF EXISTS "linha_base";
DROP TABLE IF EXISTS "checklist_item_projeto";

-- Solicitação de revisão: sem aceitar/recusar nem anexo; a situação sai dos apontamentos da
-- rodada, ligados pela tarefa que o envio cria.
ALTER TABLE "solicitacao_revisao"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "respostaMotivo",
  DROP COLUMN IF EXISTS "anexoPath",
  DROP COLUMN IF EXISTS "anexoNome",
  DROP COLUMN IF EXISTS "respondidoEm",
  ADD COLUMN IF NOT EXISTS "tarefaId" TEXT;

CREATE INDEX IF NOT EXISTS "solicitacao_revisao_tarefaId_idx" ON "solicitacao_revisao"("tarefaId");

DROP TYPE IF EXISTS "StatusSolicRevisao";

-- O par `projetos:extras` saiu do catálogo junto com a aba.
DELETE FROM "permissao_perfil" WHERE "recurso" = 'projetos' AND "acao" = 'extras';
DELETE FROM "permissao_usuario" WHERE "recurso" = 'projetos' AND "acao" = 'extras';
DELETE FROM "permissao" WHERE "recurso" = 'projetos' AND "acao" = 'extras';
