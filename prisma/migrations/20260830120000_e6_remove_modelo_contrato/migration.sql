-- E6: remove o pipeline de modelo de contrato em texto puro.
-- Substituído por `DocumentoModelo` (tipo=contrato) do Estúdio de Documentos.
--
-- `IF EXISTS` é obrigatório aqui: em produção a tabela já foi dropada à mão em 2026-08-30
-- (via `scripts/e6-limpar-modelo-contrato.py`, após conferir count=0), FORA do controle do
-- Prisma. Sem o guard, o `migrate deploy` do próximo release quebraria naquele servidor.
DROP TABLE IF EXISTS "modelo_contrato";
