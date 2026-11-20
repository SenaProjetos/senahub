-- Pedido de revisão do cliente: o status só pode ser um dos quatro da máquina de estados
-- (modules/portal/pedido-revisao/regras.ts STATUS_PEDIDO). Coluna TEXT como as demais do módulo; a restrição fica no
-- banco (não representável no schema.prisma), para nenhum caminho gravar um valor fora da máquina.
ALTER TABLE "pedido_revisao_cliente"
  ADD CONSTRAINT "pedido_revisao_cliente_status_check"
  CHECK ("status" IN ('aguardando', 'aceito', 'recusado', 'cancelado'));
