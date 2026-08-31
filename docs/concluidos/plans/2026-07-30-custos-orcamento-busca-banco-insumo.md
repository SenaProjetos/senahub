# Engenharia de Custos — Orçamento: busca de banco integrada + item de insumo direto

**Data:** 2026-07-30 · **Status:** implementado — tsc/test/lint/build limpos; falta smoke em navegador (usuário) · **Branch:** `dev` · **Modelo:** Sonnet

Depende de: C2 — Orçamento (implementado). Fonte: pedido do usuário após revisão visual das telas
`/custos/[id]` (planilha) e do diálogo "Novo Serviço".

## 1. Goal

Hoje criar um item de serviço na planilha é um processo em 2 passos desconectados: (1) `ItemDialog`
("Novo serviço") cria um item em branco com custo digitado à mão; (2) só depois, via menu "...", o
usuário abre `VincularComposicaoDialog` pra buscar e linkar uma composição do banco (o que recalcula o
custo e some com o campo manual). Essa onda funde os dois passos e adiciona um segundo caminho de
vínculo que não existe hoje: insumo direto (sem passar por composição).

Decisões já fechadas com o usuário (AskUserQuestion, 2026-07-30):
- Item novo de serviço **não aceita mais custo digitado à mão** — tem que vir de uma composição ou de um
  insumo do banco. Pra algo fora do banco, o caminho é criar uma composição própria primeiro (em
  `/custos/bancos`) e depois buscar ela aqui.
- Itens antigos com custo manual (já existentes, `composicaoId`/`insumoId` nulos) continuam editáveis
  normalmente — a mudança vale só pra criação de item novo.
- Busca não fica restrita a uma base — o usuário confirmou que quer poder achar composição/insumo de
  qualquer banco, **incluindo o banco próprio do SenaHub** (base `regime: "padrao"`, não só bases
  importadas tipo SINAPI).

## 2. O que já existe (não reinventar)

- `buscarComposicoesParaVinculo` (`orcamento/actions.ts:239`) já busca **sem filtro de base nenhum** —
  `prisma.custoComposicao.findMany({ where: q ? {OR: [codigo, descricao]} : {} })` sobre TODAS as
  composições de TODAS as bases. O "buscar em mais de um banco" pedido já vale estruturalmente pra
  composição — falta só contexto visual (de qual base cada resultado vem) nos resultados.
- `custoDaComposicao(db, composicaoId, basePrecoId)` (`orcamento/service.ts:148`) já resolve o custo
  usando o `basePrecoId` **do orçamento** (não da composição) — a composição é só estrutura/coeficientes;
  o preço de cada insumo referenciado vem da base escolhida no cabeçalho do orçamento
  (`temBasePreco`/`orcamento.basePrecoId`). Isso não muda — o padrão se repete pro insumo direto.
- `CustoPreco` é `@@unique([baseId, insumoId])` (sem campo `dataBase` próprio — a data vem inteira de
  `CustoBasePreco.dataBase`, cada base já é um snapshot de uma data) — dá pra resolver o preço de um
  insumo direto na base do orçamento com um lookup único, sem árvore de coeficientes.
- `group-hover` já é padrão usado em `chat-view.tsx`, `notificacoes-view.tsx`,
  `disciplinas-kanban.tsx` — reaproveitar a mesma classe, não inventar outra.

## 3. Schema

`CustoOrcamentoItem` ganha um segundo vínculo opcional, irmão de `composicaoId`:

```prisma
/// Insumo direto (sem composição) de origem do custo. Nunca setado junto com composicaoId — cada
/// vincular*() zera o outro campo explicitamente (ver §4, "consistência tri-state").
insumoId String?
insumo   CustoInsumo? @relation(fields: [insumoId], references: [id], onDelete: SetNull)
```

Comentário de `composicaoId` atualizado: "Null = insumo direto (ver insumoId) ou custo digitado à mão
(item antigo)." `@@index([insumoId])`. Migração aditiva (coluna nullable) — sem perda de dado, sem
`--accept-data-loss`.

## 4. Service

- Novo `custoDoInsumo(db, insumoId, basePrecoId)` em `orcamento/service.ts`, ao lado de
  `custoDaComposicao` — mesmo formato de retorno (`{custo, semPreco} | {erro}`), mas é 1 lookup direto em
  `CustoPreco` (sem árvore de coeficiente): sem preço na base → `semPreco: [insumoId]`.
- `criarItem` (service + schema + action) ganha `composicaoId?`/`insumoId?` opcionais. Quando um dos dois
  vier, o item nasce já vinculado e precificado (chama `custoDaComposicao`/`custoDoInsumo` na criação,
  mesma mecânica que `vincularComposicao` já faz pós-criação). Sem nenhum dos dois **e** `tipo: "servico"`
  → erro (`ActionError`): criação de serviço sem vínculo não é mais permitida.
- `vincularComposicao` (já existe) e novo `vincularInsumo` (mesma forma) continuam existindo — usados
  pra RE-vincular um item já criado (ex.: trocar de composição depois).
- `editarItem` não muda de comportamento, mas quando `input.custoUnitario` vem (edição manual), o
  `data` do update passa a zerar **os dois**: `composicaoId: null, insumoId: null` (hoje só zera
  `composicaoId` — `service.ts:289`). Item antigo com custo manual (ambos nulos) segue editável como
  hoje (`vinculado` check em `item-dialog.tsx:61` passa a olhar `composicaoId !== null || insumoId !== null`).

### Consistência tri-state (origem do custo: composição | insumo | manual)

`insumoId` reintroduz o mesmo risco que o comparador de C4 já ensinou a temer: um "número errado sem
erro". Cada ponto do código que hoje pergunta "esse item é derivado de composição?" checando só
`composicaoId` precisa também considerar `insumoId` — listado explicitamente, não deixado pra achar na
hora:

1. `vincularComposicao` (`service.ts:357`) — ao setar `composicaoId`, zera `insumoId: null` no mesmo
   update (defesa contra re-vincular um item que já era insumo-direto).
2. `vincularInsumo` (novo) — espelha o inverso: seta `insumoId`, zera `composicaoId: null`.
3. `editarItem` (`service.ts:289`) — custo manual zera os dois (ver acima).
4. **`previewTrocaBase` (`service.ts:417-423`, usada também por `aplicarTrocaBase` que a chama
   internamente — um fix cobre os dois)** — hoje: `if (item.composicaoId && !bloqueado)` recalcula,
   `else if (!item.composicaoId)` trata como manual/congelado. Isso classificaria um item insumo-direto
   como "manual" e congelaria o preço numa troca de base — errado, silencioso, sem exceção. Vira:
   recalcula via `custoDaComposicao` OU `custoDoInsumo` conforme qual dos dois está setado; só cai no
   ramo "manual" quando **nenhum** dos dois está setado.
5. `duplicarOrcamento` (`service.ts:508-524`) copia os itens pra um novo orçamento via
   `ItemParaDuplicar` — tipo **puro e testado** em `duplicar-orcamento.ts`. Hoje só carrega
   `composicaoId`; sem adicionar `insumoId: string | null` ali (+ passthrough em `duplicarItens`), todo
   item insumo-direto perderia o vínculo ao duplicar o orçamento — vira manual por acidente, silenciosamente.
   Novo caso de teste em `duplicar-orcamento.test.ts` mirando o que já existe pra `composicaoId`.
6. `item-dialog.tsx:61` (`vinculado`) — trava edição de unidade/custo também quando `insumoId !== null`.
7. `queries.ts` (`ItemArvore`, linhas 31-32/103-104) — ganha `insumoId`/`insumoCodigo` ao lado de
   `composicaoId`/`composicaoCodigo`, pro badge de origem na árvore.
8. `composicoesResolvidas` (`queries.ts:203`, breakdown de sub-itens da composição pro detalhe do
   serviço) — **fora de escopo intencionalmente**: insumo direto não tem sub-itens pra detalhar (é
   atômico), não é uma lacuna a fechar.

`orcamento-arvore.ts` (roll-up puro) não entra nessa lista — não lê `composicaoId` em lugar nenhum, só
consome `custoUnitario` já materializado, então independe de onde o custo veio.

## 5. Actions / queries

- `buscarComposicoesParaVinculo`: `CustoComposicao` tem `baseId`/`base` (FK pra `CustoBasePreco`,
  confirmado no schema). Adiciona `select: { ..., base: { select: { nome: true, fonte: true } } }` pra
  mostrar de qual banco cada resultado vem — só contexto, não filtro (a busca já é global, sem `where`
  de base). Retorno ganha `basePrecoNome`.
- Nova `buscarInsumosParaVinculo({ q })`, mesmo padrão de busca (`codigo`/`descricao` contains,
  insensitive, take 20) sobre `CustoInsumo` — catálogo é global (preço é que varia por base), então não
  tem "banco" pra mostrar aqui, só `categoria`.
- Nova action `vincularInsumo` espelhando `vincularComposicao`.

## 6. UI

- `ItemDialog` perde a criação de serviço com custo manual — fica só pra **grupo** (criar/editar) e pra
  **editar** um serviço já existente (vinculado ou manual antigo). O botão de criar serviço em branco sai
  do fluxo de criação.
- Um dialog novo de busca+criação, **parametrizado por fonte** — não duas cópias. A única diferença real
  entre "buscar composição" e "buscar insumo" é a query e o rótulo; um componente com prop
  `fonte: "composicao" | "insumo"` (chamando `buscarComposicoesParaVinculo` ou `buscarInsumosParaVinculo`
  conforme a prop, mostrando base/fonte só quando `fonte === "composicao"`) evita a dupla cópia de
  layout de busca que já causou drift duas vezes nesta sessão (enum de categoria mirrorado 2x em C4).
  Reaproveita o layout de busca do `VincularComposicaoDialog` atual (input + lista clicável).
  `VincularComposicaoDialog` (RE-vincular um item já criado) recebe o mesmo tratamento — vira
  parametrizado por fonte, não ganha um arquivo irmão `VincularInsumoDialog`.
- `orcamento-arvore-view.tsx`: dentro do menu de um grupo, "Serviço aqui" vira dois itens —
  **"Serviço (composição)"** e **"Item (insumo)"** — abrindo cada dialog novo. Badge de vínculo na
  descrição ganha uma segunda variante pra insumo (hoje só mostra `composicaoCodigo`; adicionar
  `insumoCodigo` com estilo levemente distinto, ou o mesmo `Badge variant="outline"` com prefixo
  diferente — decidir na implementação, não é uma decisão de produto).
- Atalhos em hover: `TableRow` ganha `group` (Tailwind), os botões de ação mais usados (editar = `Pencil`,
  e — só em linha de grupo — adicionar serviço/item) viram ícones sempre no DOM mas `opacity-0
  group-hover:opacity-100` (padrão já usado em `chat-view.tsx`/`notificacoes-view.tsx`). O menu "..."
  continua com o resto (mover, travar, vincular de novo, excluir) — não migra tudo pro hover, só
  editar+adicionar.

## 7. Fora de escopo

- Trocar `Fornecedor`/preço de RFQ pela busca aqui — cotações (C4) é caminho separado, sem relação com
  este fluxo.
- Composição/insumo criados on-the-fly de dentro do orçamento — se não existir no banco, o caminho
  continua sendo ir em `/custos/bancos` criar lá primeiro (decisão já fechada com o usuário).
- Mudar como `custoDaComposicao` resolve preço (árvore de coeficiente) — só adiciona o caminho paralelo
  pra insumo direto, não toca na composição.

## 8. Passos de execução

- [x] Passo A — schema (`insumoId` em `CustoOrcamentoItem`, + relação inversa
  `CustoInsumo.itensOrcamentoDireto`) + migração `20260730180000_orcamento_item_insumo_direto` (aditiva,
  sem drift real — só `ADD COLUMN` nullable, sem `--accept-data-loss`).
- [x] Passo B — `custoDoInsumo` (lookup direto, sem árvore de coeficiente — corrigido depois de uma
  primeira versão errada com composite key inexistente), `criarItem` com vínculo opcional + guard
  "serviço sem vínculo" (`ActionError`), `vincularInsumo`, `buscarInsumosParaVinculo`,
  `buscarComposicoesParaVinculo` com `basePrecoNome`. Todos os 8 pontos de consistência tri-state do §4
  aplicados: `editarItem` zera os dois FKs, `vincularComposicao`/`vincularInsumo` zeram o oposto,
  `previewTrocaBase` recalcula insumo-direto em vez de congelar (o bug que o advisor pegou antes do
  código existir), `duplicarOrcamento`/`ItemParaDuplicar` carregam `insumoId`, `item-dialog.tsx`
  `vinculado` cobre os dois, `ItemArvore` ganhou `insumoId`/`insumoCodigo`.
- [x] Passo C — `BuscaBancoDialog` único, parametrizado por `fonte` ("composicao"|"insumo") **e** `modo`
  ("criar"|"vincular") — substitui `vincular-composicao-dialog.tsx` (removido) sem criar arquivo irmão
  pra insumo. `ItemDialog` restrito a grupo (criar) + qualquer serviço (editar). Badge `insumoCodigo`
  (`variant="secondary"`) ao lado do `composicaoCodigo` (`variant="outline"`) na árvore.
- [x] Passo D — hover shortcuts (editar sempre; "+" serviço só em grupo) via o mesmo padrão
  `opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100` de
  `notificacoes-view.tsx` — menu "..." intocado pro resto.
- [x] Passo E — `duplicar-orcamento.test.ts` ganhou o caso insumo-direto; `service.test.ts` (novo arquivo)
  testa o guard "servico sem vínculo lança ActionError" sem DB (o guard roda antes do
  `prisma.$transaction`, mesmo padrão de `avisos/service.test.ts` testando só as fatias puras de um
  service.ts com I/O). 1433/1433 depois dos 3 testes novos.
- [x] Passo F — `tsc`/`lint`/`test` limpos. `build` bateu 2x num WIP concorrente alheio (não relacionado
  — `ponto`/`rh`, feature de banco de horas sendo editada ao vivo por fora desta sessão) antes de fechar
  limpo na 3ª tentativa, confirmado com o usuário antes de cada retry. Smoke no banco de dev (6 checks):
  guard de criação sem vínculo, criação via insumo com custo calculado, criação via composição,
  `editarItem` manual zera os dois FKs, `duplicarOrcamento` preserva `insumoId`, `previewTrocaBase`
  recalcula item insumo-direto (**não congela** — a asserção que prova o fix do bug do advisor). 2
  rodadas de smoke com falha por engano meu (nome de campo `preview.itens`→`.linhas`,
  `custoNovo`→`custoDepois`; chave composta `baseId_insumoId_dataBase`→`baseId_insumoId`, já que
  `CustoPreco` não tem campo `dataBase` próprio — corrigido §2 do plano) deixaram 5 orçamentos `TESTE*`
  órfãos no banco; limpos numa passada final, confirmado 0 residual.

## 9. Verificação manual (roteiro, pendente do usuário — sem browser nesta sessão)

1. `/custos/[id]` → grupo → "Serviço (composição)" → buscar, ver base/fonte no resultado, escolher →
   item nasce com custo calculado.
2. Mesmo grupo → "Item (insumo)" → buscar, escolher → item nasce com custo calculado.
3. Tentar criar serviço sem escolher nada (se sobrar algum caminho manual por engano) → deve falhar.
4. Editar um item antigo com custo manual (se houver algum na base de teste) → continua editável.
5. Hover numa linha → ícones de editar/adicionar aparecem; menu "..." continua com o resto.
