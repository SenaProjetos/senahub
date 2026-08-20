-- SolicitacaoCadastro.role -> tipoPretendido (TipoUsuario) + contratacaoPretendida (Contratacao?).
-- R6 ("Role como dado") do plano docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md.
--
-- Por que dois campos e não um: o censo mostrou que 27 dos 32 pedidos são `cliente`, que no
-- modelo novo é `tipo: externo` e contratação NENHUMA — nenhum enum de contratação sozinho
-- conseguiria representar a resposta mais comum do formulário.

-- 1. Colunas novas, com default seguro (ninguém fica sem valor durante a transição).
ALTER TABLE "solicitacao_cadastro"
  ADD COLUMN "tipoPretendido"        "TipoUsuario"  NOT NULL DEFAULT 'externo',
  ADD COLUMN "contratacaoPretendida" "Contratacao";

-- 2. Backfill determinístico dos pedidos já existentes, pelo mesmo mapa de `derivarEixos`
--    (src/modules/usuarios/vinculo/mapa.ts). Nenhum pedido pendente hoje em produção — isto
--    preserva a trilha dos 32 históricos, que continuam sendo registro de auditoria.
--    `freelancer` vira `pj` provisoriamente, igual ao backfill da Fase 0 (§9.2 do plano):
--    a separação pj × autonomo_rpa é pessoa a pessoa. Pedidos NOVOS não precisam disso —
--    o formulário passa a perguntar direto.
UPDATE "solicitacao_cadastro" SET "tipoPretendido" = 'externo', "contratacaoPretendida" = NULL
 WHERE "role" = 'cliente';

UPDATE "solicitacao_cadastro" SET "tipoPretendido" = 'interno', "contratacaoPretendida" = 'clt'
 WHERE "role" IN ('clt', 'administrativo', 'ti', 'supervisor', 'admin');

UPDATE "solicitacao_cadastro" SET "tipoPretendido" = 'interno', "contratacaoPretendida" = 'estagio'
 WHERE "role" = 'estagiario';

UPDATE "solicitacao_cadastro" SET "tipoPretendido" = 'interno', "contratacaoPretendida" = 'pj'
 WHERE "role" IN ('projetista_pj', 'freelancer');

-- 3. Só então a coluna antiga sai. Depois deste ponto `SolicitacaoCadastro` não referencia
--    mais o enum `Role` — um dos bloqueios para dropá-lo na Onda F.
ALTER TABLE "solicitacao_cadastro" DROP COLUMN "role";
