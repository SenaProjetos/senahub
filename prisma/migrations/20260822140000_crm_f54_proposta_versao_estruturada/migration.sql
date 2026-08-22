-- CRM Fase 5 (F5.4, ADR-05 / P14 item 3): `PropostaVersao` ganha campos estruturados ao lado
-- do `snapshot` JSON, que PERMANECE (é o único lugar com itens e condições linha a linha).
--
-- ── Aditivo, e o backfill roda AQUI de propósito ────────────────────────────────────────────
-- Diferente da F5.2 (script à mão, porque lá o vínculo exigia decisão humana em caso ambíguo),
-- aqui o backfill é DERIVAÇÃO PURA do próprio `snapshot` — não há o que decidir, e deixá-lo
-- como passo manual criaria uma janela em que versões antigas ficariam sem valor e a UI teria
-- de manter o caminho "parseia o JSON" como fallback. Isso anularia o objetivo da tarefa, que
-- é justamente comparar versões SEM parsear JSON.
--
-- ── O que o backfill consegue derivar, e o que honestamente não consegue ────────────────────
-- Derivável do snapshot: `valorOriginal`/`valorVersao` (soma dos itens), `validade`,
-- `observacao`. Sem `desconto` na origem, `valorVersao = valorOriginal` — que é exatamente o
-- estado "nenhum desconto foi concedido nesta versão", não um valor faltando.
-- NÃO derivável, e por isso fica NULL no histórico: `status` e `dataEnvio` — o snapshot nunca
-- guardou nenhum dos dois, e inventá-los a partir do estado ATUAL da proposta atribuiria a uma
-- versão de meses atrás o status de hoje. `desconto` idem (nasce com a UI da F5.8).
--
-- ── A guarda de `jsonb_typeof` não é zelo ───────────────────────────────────────────────────
-- `jsonb_array_elements` estoura em runtime se o valor não for array. `snapshot->'itens'` é
-- array em todo registro escrito por `salvarProposta`, mas o snapshot é JSON livre e nada no
-- banco garante isso — uma linha malformada derrubaria a migration inteira no deploy, que é o
-- pior lugar possível para descobrir. Com a guarda, ela fica com valor NULL e o resto passa.

-- AlterTable
ALTER TABLE "proposta_versao" ADD COLUMN     "valorOriginal" DECIMAL(14,2),
ADD COLUMN     "valorVersao" DECIMAL(14,2),
ADD COLUMN     "desconto" DECIMAL(14,2),
ADD COLUMN     "status" "StatusProposta",
ADD COLUMN     "validade" DATE,
ADD COLUMN     "dataEnvio" TIMESTAMP(3),
ADD COLUMN     "observacao" TEXT;

-- Backfill: soma dos itens do snapshot → valorOriginal/valorVersao.
UPDATE "proposta_versao" pv
SET "valorOriginal" = sub.total,
    "valorVersao"   = sub.total
FROM (
  SELECT v.id,
         COALESCE(SUM((item->>'valor')::numeric), 0) AS total
  FROM "proposta_versao" v,
       LATERAL jsonb_array_elements(v.snapshot->'itens') AS item
  WHERE jsonb_typeof(v.snapshot->'itens') = 'array'
  GROUP BY v.id
) sub
WHERE pv.id = sub.id;

-- Backfill: metadados que o snapshot guardava como texto.
-- `validade` foi gravada como "AAAA-MM-DD" (ou null); a checagem de formato evita que uma
-- string inesperada estoure o cast e derrube a migration.
UPDATE "proposta_versao"
SET "validade" = (snapshot->>'validade')::date
WHERE snapshot->>'validade' ~ '^\d{4}-\d{2}-\d{2}$';

UPDATE "proposta_versao"
SET "observacao" = snapshot->>'observacoes'
WHERE snapshot->>'observacoes' IS NOT NULL;
