-- Reconfirmação anual dos dados do cadastro: tipo do pedido e data da última confirmação.
-- Aditiva. Ninguém começa confirmado: o automático só pega quem já confirmou há 12 meses, então o
-- deploy não dispara pedido para todo mundo; a primeira rodada é o RH quem manda, em lote.

CREATE TYPE "TipoPedidoDados" AS ENUM ('completar', 'reconfirmar');
ALTER TABLE "pedido_dados_cadastro" ADD COLUMN "tipo" "TipoPedidoDados" NOT NULL DEFAULT 'completar';
ALTER TABLE "user" ADD COLUMN "dadosConfirmadosEm" TIMESTAMP(3);
