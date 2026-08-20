-- CRM Fase 2 (F2.12): `Lead` ganha temperatura manual.
--
-- `Negociacao.temperatura` já nasceu na F2.4; esta migration fecha o outro lado, para os dois
-- funis terem o mesmo eixo de leitura rápida.
--
-- ADITIVA e nullable. `null` = "ninguém classificou ainda", que é DIFERENTE de FRIO: o card não
-- pinta nada nesse caso, em vez de mostrar todo lead novo como frio — o que faria o board inteiro
-- nascer azul e a cor perder o significado.
--
-- Manual de propósito: sem IA, sem scoring automático (veredito do dono no roadmap A–F).

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "temperatura" "Temperatura";
