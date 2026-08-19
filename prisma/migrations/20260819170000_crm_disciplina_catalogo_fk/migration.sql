-- CRM Fase 1e (F1.19c): Disciplina.nome (texto livre) ganha FK para o catálogo.
--
-- Fecha o buraco que a F1.15/F1.16 encontrou: F1.19 pôs a FK em `PropostaItem`, F1.20 em
-- `ItemTabelaPreco`, e ninguém pôs em `disciplina` — justamente a tabela onde as grafias livres
-- vivem e a que carrega `valor` (pagamento ao projetista), `RevisaoDisciplina`, uploads,
-- responsáveis e apontamentos. Sem esta coluna o aceite da F1.21 não tem como ser cumprido.
--
-- ⚠️ A COLUNA FÍSICA `nome` NÃO é renomeada. No schema Prisma ela passa a se chamar
-- `disciplinaTextoLegado` via `@map("nome")` — o nome muda só no código, o dado não se move.
-- Por isso este arquivo não tem RENAME nenhum: `@map` é efeito zero em SQL. O ponto do padrão
-- (F1.19) é que os pontos de leitura falhem em COMPILAÇÃO e não em runtime; aqui são ~74
-- arquivos, contra 9 na F1.19, o que torna a garantia de compilação mais valiosa ainda.
--
-- `disciplinaId` é NULLABLE de propósito: produção tem 18 grafias distintas em `disciplina`,
-- 12 batendo exato com o catálogo e 6 precisando de tratamento manual — 3 que colapsam
-- (`Ar condicionado (ARC)`/`Exaustão (EXT)` → `Climatização (AVAC)`, `Gases` → `Gás`) e 3
-- strings compostas que exigem decisão do responsável de cada projeto (260014, 260020, 260023;
-- ver `docs/crm/03-migracao.md` §5). Disciplina que não resolve fica sem FK — é estado
-- esperado, e `disciplinaTextoLegado` continua sendo o texto exibido.
--
-- ⚠️ SEM BACKFILL AQUI, DE PROPÓSITO — diferente da F1.19, que trazia um UPDATE no fim.
-- Foi o bug da F1.23: `migrate deploy` roda ANTES do `db:seed` no fluxo de deploy, então um
-- UPDATE guardado por "se o catálogo já existir" pode não fazer nada, em silêncio, e nunca mais
-- re-rodar. E `disciplina` é a tabela que carrega o pagamento ao projetista: escrever nela sem
-- alguém ver o que vai mudar é o oposto do que a F1.15 provou ser necessário. O backfill vive em
-- `scripts/backfill-disciplina-f119c.ts`, idempotente, com dry-run antes do `--gravar`.

-- AlterTable
ALTER TABLE "disciplina" ADD COLUMN     "disciplinaId" TEXT;

-- CreateIndex
CREATE INDEX "disciplina_disciplinaId_idx" ON "disciplina"("disciplinaId");

-- AddForeignKey
ALTER TABLE "disciplina" ADD CONSTRAINT "disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
