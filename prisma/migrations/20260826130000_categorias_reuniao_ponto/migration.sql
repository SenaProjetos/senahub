-- Categorias explícitas para horas não alocadas a projeto.
-- O DEFAULT protege a tabela já populada; o UPDATE preserva todas as sessões
-- históricas que já têm projeto vinculado.
CREATE TYPE "TipoAlocacaoPonto" AS ENUM ('projeto', 'sem_projeto', 'reuniao_interna', 'reuniao_externa');

ALTER TABLE "sessao_trabalho"
  ADD COLUMN "tipoAlocacao" "TipoAlocacaoPonto" NOT NULL DEFAULT 'sem_projeto';

UPDATE "sessao_trabalho"
  SET "tipoAlocacao" = 'projeto'
  WHERE "projetoId" IS NOT NULL;
