-- Ciclo documental: o TIPO de documento diz se a revisão só publica com o DWG (decisão do dono,
-- 2026-10-09; configurado em Configurações → Nomenclatura → Tipos). Padrão ligado: todo tipo exige,
-- e quem gerencia o catálogo desliga nos que não têm desenho (memorial, memória de cálculo…).
-- Só acrescenta. A coluna só tem efeito em `categoria = 'tipo'`.
ALTER TABLE "prancha_catalogo" ADD COLUMN "exigeDwg" BOOLEAN NOT NULL DEFAULT true;
