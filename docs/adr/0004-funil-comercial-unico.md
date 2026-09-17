---
status: accepted
date: 2026-09-16
---

# ADR-0004 — Prospecção e Negociação viram um board único, com a costura em `OPORTUNIDADE_CRIADA`

`Lead` (prospecção) e `Negociacao` continuam sendo duas entidades, exatamente como a reforma CRM
(F0-F7, `docs/crm/`) decidiu — este ADR não reabre ADR-16/ADR-18. O que muda é só a **superfície**:
`/comercial/prospeccao` e `/comercial/negociacoes` (dois Kanbans, duas rotas) viram um board único,
com a transição `Lead → Negociacao` acontecendo **dentro** do arrastar-e-soltar, não em duas telas
separadas por navegação.

## Contexto

Hoje um lead em `OPORTUNIDADE_CRIADA` aparece na coluna "Negociação criada" do board de prospecção
**e** a `Negociacao` que `qualificarProspeccao` já criou pra ele (`Negociacao.leadId @unique`)
aparece nas colunas do board de negociação — o mesmo negócio, duas vezes, em duas telas. Isso só não
é visível hoje porque as telas nunca são vistas lado a lado. Um board único que simplesmente
concatenasse as duas listas de colunas duplicaria esses cards.

Pedido do dono (2026-09-16): juntar as duas telas num board único porque são "um fluxo único" — o
card que nasce lead vira negociação e no fim vira projeto contratado.

## Decisão

1. **`OPORTUNIDADE_CRIADA` deixa de ser coluna visível.** Ela é a fronteira entre os dois lados do
   board, não um destino. Soltar um card na primeira coluna de negociação (Levantamento) dispara
   `qualificarProspeccao` de verdade (via `service.ts`, dentro de transação) — nunca um `update` cru
   de `status`. É o mesmo princípio que `criarPropostaDeLead` já usa (ADR-21 item 5).
2. **Lead fora do fluxo exige confirmação explícita antes de qualificar.** `SEM_OPORTUNIDADE`,
   `EM_ESPERA` e `DESCARTADO` estão fora do fluxo por decisão de alguém (mesma regra de
   `validarQualificacao` que already recusa esses três status). Arrastar um desses direto pra
   negociação pede confirmação na UI ("Esta prospecção está descartada/em espera. Qualificar vai
   reativá-la.") e o servidor só procede com um consentimento **explícito no payload** — nunca
   decorativo, seguindo a mesma armadilha que ADR-21 §5b já documentou pra propostas.
3. **Arrastar de volta pra trás da costura é recusado no servidor.** `validarMovimentoProspeccao` já
   bloqueia sair de `OPORTUNIDADE_CRIADA` — nenhuma mudança de regra aqui, só de onde ela é visível
   (drag entre colunas do mesmo board, não entre duas telas).
4. **Colunas terminais viram 1 grupo "Encerrados", colapsado por padrão.** Prospecção tem
   `SEM_OPORTUNIDADE`/`EM_ESPERA`/`DESCARTADO`; negociação tem `PERDIDO`/`EM_ESPERA`/`CANCELADO`. As
   6 não viram 6 colunas — viram uma coluna colapsada, e cada card carrega o status original como
   campo/badge (visível ao expandir ou dentro do modal do card). Reabertura (`reabrirNegociacao`,
   já existente) continua funcionando de dentro do grupo.
5. **Coluna colapsada não busca cards.** Mantém o ganho de performance do F6.11 (oito buscas fixas
   por id, 25 cards/coluna) — colapsar não é só CSS escondendo, é a query não rodar.

## Alternativas consideradas

1. **Concatenar as duas listas de colunas, sem tratar a costura.** Rejeitada — duplica todo card já
   qualificado (o defeito que motivou este ADR).
2. **Manter duas rotas, só com toolbar fixa entre elas.** Resolve o pedido de navegação (já é a Fase
   A do plano), mas não seria "um fluxo único" — o dono pediu explicitamente um board.
3. **6 colunas terminais, todas visíveis.** Mais literal, mas o board passaria de 9 pra 14+ colunas
   — o oposto de "facilitar a visualização" que motivou pedir colunas minimizáveis.

## Consequências

- `/comercial/prospeccao` e `/comercial/negociacoes` passam a redirecionar pro board único. Os deep
  links já em produção precisam continuar resolvendo: `?negociacao=<id>` (escrito pelo job de
  automações F7.3 em sinos já entregues) e `/comercial/<id>` (ficha do lead, notificações e o smoke
  `crm-e2e`).
- `scripts/audit-crm-performance.ts` e `scripts/explain-crm-performance.ts` mediam "Kanban de
  prospecção" e "Kanban de negociação" como dois fluxos separados (F6.11) — viram um fluxo médio
  único, com mais colunas fixas; os `EXPLAIN` e os índices que eles cobram precisam ser revisados,
  não só a UI.
- `08-aceite-e2e.md` referencia as duas rotas atuais nos 20 critérios do aceite CRM — precisa de
  emenda apontando pro board único (ou uma nota de que os critérios continuam válidos via redirect).
- Detalhe de execução (não é decisão de produto, fica no plano): a transação de `qualificarProspeccao`
  hoje abre a própria `$transaction` internamente — reusar dentro do fluxo de drag-and-drop do board
  segue a mesma forma que ADR-21 já resolveu pra `criarPropostaDeLead` (extrair o miolo pra receber
  `tx`).

Plano de execução:
[`docs/superpowers/specs/2026-09-16-comercial-funil-unico.md`](../superpowers/specs/2026-09-16-comercial-funil-unico.md).
