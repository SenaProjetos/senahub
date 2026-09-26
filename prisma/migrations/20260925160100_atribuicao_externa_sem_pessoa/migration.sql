-- O recurso "Externo" (`ext`) é ninguém da casa e zero hora da casa. Sem estes CHECKs, uma
-- atribuição externa COM pessoa entraria na carga dela (hora que ninguém vai trabalhar) e COM
-- horas entraria no custo previsto e na demanda por perfil — nos dois casos, número inventado
-- que nenhuma tela denuncia.
--
-- Nenhuma linha existente usa 'ext' (o valor nasceu na migration anterior), então não há
-- backfill: quem converte as linhas antigas marcadas pela origem é `scripts/marcar-etapas-de-terceiro.ts`.
ALTER TABLE "eap_atribuicao"
  ADD CONSTRAINT "eap_atribuicao_externo_sem_pessoa" CHECK ("papel" <> 'ext' OR "userId" IS NULL);

ALTER TABLE "eap_atribuicao"
  ADD CONSTRAINT "eap_atribuicao_externo_sem_horas" CHECK ("papel" <> 'ext' OR "horasPrevistas" = 0);
