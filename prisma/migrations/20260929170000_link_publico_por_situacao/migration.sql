-- Link público com as pastas "Compartilhado" e "Liberado para obra" (reunião de 29/09/2026).
--
-- Aditiva: coluna booleana com padrão falso — todo link que já existe continua servindo exatamente o que
-- servia (a última revisão validada de cada documento). Link novo nasce com a opção ligada pela tela.

-- AlterTable
ALTER TABLE "link_publico_arquivos" ADD COLUMN "porSituacao" BOOLEAN NOT NULL DEFAULT false;
