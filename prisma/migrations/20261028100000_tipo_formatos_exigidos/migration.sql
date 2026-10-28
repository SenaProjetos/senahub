-- Ciclo documental: o TIPO de documento passa a dizer QUAIS arquivos a publicação exige (DWG, PDF, Excel,
-- Word, "Word ou Excel"), no lugar do "exige DWG" sim/não (decisão do dono, 2026-10-28). Só acrescenta:
-- `exigeDwg` fica sem uso e sai num deploy posterior. A coluna só tem efeito em `categoria = 'tipo'`.
ALTER TABLE "prancha_catalogo" ADD COLUMN "formatosExigidos" TEXT[] NOT NULL DEFAULT ARRAY['pdf']::TEXT[];

-- Partida: PDF em todo tipo; DWG onde já estava configurado.
UPDATE "prancha_catalogo" SET "formatosExigidos" = ARRAY['dwg', 'pdf']::TEXT[]
WHERE "categoria" = 'tipo' AND "exigeDwg" = true;

-- Pelo que o dono contou da entrega (2026-10-28): quantitativo só em Excel; memorial em Word ou Excel + PDF.
-- Só os tipos globais do catálogo; quem gerencia o catálogo ajusta o resto na tela.
UPDATE "prancha_catalogo" SET "formatosExigidos" = ARRAY['excel']::TEXT[]
WHERE "categoria" = 'tipo' AND "projetoId" IS NULL AND "sigla" = 'QTO';

UPDATE "prancha_catalogo" SET "formatosExigidos" = ARRAY['word_ou_excel', 'pdf']::TEXT[]
WHERE "categoria" = 'tipo' AND "projetoId" IS NULL AND "sigla" IN ('MEM', 'MEC');
