# Plano — Refatoração de `/financeiro/folha-projetistas` (Produção)

- **Data:** 2026-09-10
- **Origem:** dono pediu revisão de UI/UX e de funções da tela.
- **Estado:** **F0a entregue** — `tsc`, `eslint`, 64 testes do financeiro e `smoke:sync-pagamento` (19/19) verdes. F0–F7 pendentes.
  - **Falta smoke em navegador.** O banco de dev não tinha linha zerada (a tela nova fica invisível sem ela); **1 pagamento pendente de dev foi zerado de propósito** para o teste. Conferir: aviso no topo, badge "sem valor", botão "Corrigir valor"; gerar o lote do mês dele e ver o "Pagar lote" deixar a linha zerada de fora.
  - O `smoke:sync-pagamento` não chama as actions de pagar (exigem sessão) — a guarda nova é coberta pelos testes de `folha/service.ts`.
  - Levantamento somente leitura (F0a.4 + §7.3), no servidor, na pasta do sistema:
    `npx tsx --tsconfig tsconfig.server.json scripts/levantar-folha-projetistas.ts`
- **Escopo:** UI + camada de query. Mudanças em assinatura de action ficam confinadas a F0a/F4/F5, sinalizadas.
- **Branch:** `feat/folha-projetistas` a partir de `dev`, em worktree próprio (`SENAHub-remake-folha`) — ver §8.

---

## 0. Modelo de IA por fase

Regra do repo: ao iniciar uma fase cujo modelo difere do ativo, **parar e pedir a troca via `/model`**.

| Fase | Modelo | Por quê |
| --- | --- | --- |
| **F0a** — trava de R$ 0,00 | **Opus 5** | Guarda em duas actions de dinheiro + pagamento parcial de lote. Erro aqui suja o caixa. |
| **F0** — esqueleto, abas, nomes | **Sonnet 5** | UI mecânica e bem especificada, sem query nem action. |
| **F1** — agregação + paginação | **Sonnet 5** | Queries com especificação fechada; a armadilha (D11) já está descrita. |
| **F2** — tabela, links, pagar selecionados | **Opus 5** | Nasce uma action financeira nova (lote arbitrário, notificação deduplicada, conta obrigatória) e links cruzando 4 módulos. |
| **F3** — modo por projetista | **Sonnet 5** | UI agrupada reusando a action da F2. |
| **F4** — aba de lotes | **Sonnet 5** | Tela + ajuste pequeno de retorno de action. |
| **F5** — dialog único, conta obrigatória, `fieldErrors` | **Opus 5** | Muda o schema de 2 actions de dinheiro e cria o padrão de referência de erro por campo (transversal). |
| **F6** — `service.ts` + testes | **Opus 5** | Mexe em lógica carga-estrutural (§5); precisa de julgamento sobre o que extrair. |
| **F7** — exportação + manual | **Sonnet 5** (rota) · **Haiku 4.5** (texto do manual) | Rota espelha `contas/export`; manual é redação. |

---

## 1. Superfície atual

| Arquivo | Linhas | Papel |
| --- | --- | --- |
| `src/app/(dashboard)/financeiro/folha-projetistas/page.tsx` | 30 | RSC: 3 queries em paralelo, monta 2 seções |
| `src/components/financeiro/folha/folha-lotes-section.tsx` | 218 | Card de lotes mensais + `PagarLoteDialog` |
| `src/components/financeiro/folha/folha-view.tsx` | 355 | KPIs + tabela de pagamentos + 2 dialogs + botão cancelar |
| `src/modules/financeiro/folha/queries.ts` | 25 | `listarFolha()` |
| `src/modules/financeiro/folha/actions.ts` | 228 | pagar / editar valor / cancelar |
| `src/modules/financeiro/folha-lote/queries.ts` | 24 | `listarFolhasProjetista()` |
| `src/modules/financeiro/folha-lote/actions.ts` | 133 | gerar lote / pagar lote |

**Sem `service.ts`. Sem nenhum `*.test.ts`.** Ambos são desvio do padrão descrito no `CLAUDE.md`.

### Volume medido (banco de dev, 2026-09-10)

```
pagamentos por status: pendente 7 · pago 7      (14 no total)
lotes: 0        sem lote: 14        valor R$ 0,00: 0        projetistas distintos: 3
```

**Produção (dono, 2026-09-10): 15 pagamentos, com linhas de R$ 0,00 ainda presentes.**

Consequência para priorização: **volume não é problema — paginação e índice saem do caminho
crítico.** O problema da tela é de *leitura e de confiança*, não de escala: nada é clicável
(D24) e o fluxo deixa pagar R$ 0,00 (D25). `PagamentoProjetista` só cresce, então paginação
continua no plano, mas como item de fim de fila.

---

## 2. Achados

Numerados para referência nas fases. Todos verificados no código, não inferidos.

### 2.1 Layout e nomenclatura

| # | Achado | Evidência |
| --- | --- | --- |
| **D1** | **O título da página aparece no meio da página.** `page.tsx` renderiza `FolhaLotesSection` primeiro; o `<h2>Produção</h2>` mora *dentro* de `folha-view.tsx`, que vem depois. | `page.tsx:19-27` × `folha-view.tsx:66-72` |
| **D2** | **A tela tem 3 nomes.** Rota `folha-projetistas`; `metadata.title` e o tile do hub dizem "Produção"; o manual diz "Folha de projetistas". | `page.tsx:9`, `financeiro/page.tsx:32`, `docs/manual/financeiro/README.md:41` |
| **D3** | `StatusBadge` imprime o **enum cru** (`pendente`/`pago`/`cancelado`) em vez de um rótulo. | `folha-view.tsx:139` |

### 2.2 Mecânica de lista — a tabela de pagamentos não tem nada

| # | Achado |
| --- | --- |
| **D4** | **Zero filtros.** Sem status, projetista, projeto, disciplina ou período. |
| **D5** | **Zero busca, zero ordenação, zero paginação.** `sortable-head.tsx` e `pagination.tsx` já existem em `components/ui/` e não são usados aqui. |
| **D6** | **Cancelados ficam misturados no meio dos pendentes**, sem forma de esconder. Só o `orderBy: [status, liberadoEm]` os empurra pro fim. |
| **D7** | **`liberadoEm` e `pagoEm` nunca aparecem.** Não dá para ver há quanto tempo um pendente está parado — que é a pergunta principal de uma folha. |
| **D8** | **`observacao` existe no schema e não é lida nem escrita em lugar nenhum da UI.** |
| **D9** | **Sem seleção múltipla.** Dá para pagar 1, ou um lote inteiro — não "esses cinco". Precedente pronto: `baixarEmLote` (`lancamentos/actions.ts:215`). |
| **D10** | **Sem exportação.** Precedente: `/api/financeiro/contas/export`. |

### 2.3 Camada de dados

| # | Achado |
| --- | --- |
| **D11** | **KPI acoplado à lista — armadilha.** `pendente` e `pago` são `.reduce()` sobre o **mesmo array** que a tabela renderiza (`queries.ts:17-20`). No instante em que alguém adicionar `skip`/`take`, os cards passam a mostrar o total *da página* — silenciosamente, sem erro. **Paginar e agregar são a mesma tarefa, não dois tickets.** |
| **D12** | Mesma falha em `listarFolhasProjetista`: carrega **todos** os pagamentos filhos (`include: { pagamentos: { select: { status } } }`) só para contar `qtd`/`pagos`. |
| **D13** | **Seam meio-construído:** `listarFolha(opts?: { status })` aceita filtro de status que `page.tsx` **nunca passa**. |
| **D14** | **Paginação dos lotes é client-side** sobre a lista completa (`folha-lotes-section.tsx:55-62`) — lê `page`/`pageSize` da URL mas fatia no browser. |

### 2.4 Fluxo de pagamento e de lote

| # | Achado |
| --- | --- |
| **D15** | **Conta e forma são opcionais.** Ambas partem de `__none` e a action aceita string vazia (`contaId: i.contaId || null`). Pagar sem conta cria um lançamento no caixa sem conta bancária — quebra conciliação OFX. |
| **D16** | **`StatusFolhaProjetista.aberta` é inalcançável.** `gerarFolhaDoMes` grava sempre `status: "fechada"`. O `TONE` do componente mapeia `aberta` e ele nunca ocorre. |
| **D17** | **"Nenhum pagamento no mês" vira `ActionError` → toast vermelho** para um desfecho rotineiro (`folha-lote/actions.ts:36`). |
| **D18** | **Form de gerar lote são dois `<Input type="number">` nus**, sem `<Label>`, mês como número. |

### 2.5 Duplicação e dívida estrutural

| # | Achado |
| --- | --- |
| **D19** | `PagarDialog` (`folha-view.tsx:246`) e `PagarLoteDialog` (`folha-lotes-section.tsx:120`) são **quase idênticos** — mesmos 3 campos, mesmo estado, mesmo `NONE`. |
| **D20** | `const MESES` copiado entre `folha-lotes-section.tsx:35` e `contas-pagar-receber-view.tsx:64`. |
| **D21** | **Sem `service.ts`** em `modules/financeiro/folha/` — contraria o padrão do `CLAUDE.md`. |
| **D22** | **O agregado do total do lote é escrito duas vezes:** helper privado `recalcularTotalFolha` (`folha/actions.ts:84`) e de novo inline dentro de `gerarFolhaDoMes` (`folha-lote/actions.ts:40-43`). |
| **D24** | **Nada na tela é clicável ou rastreável.** Projetista, disciplina e projeto são texto puro; o pagamento pago não mostra *em qual conta* saiu nem linka para o `Lancamento` gerado — embora `lancamentoId` esteja gravado. Consequência medida: **o dono não consegue responder "existe pagamento lançado sem conta?"** porque a tela não oferece caminho até o lançamento. |
| **D25** | **Pagar R$ 0,00 é permitido e suja o caixa.** O botão "Pagar" aparece em linha zerada; `pagarProjetista` não checa valor; `confirmarDespesaProjetista` (`custo/lancamento-custo.ts:108`) cria um `Lancamento` **confirmado de R$ 0,00** (essas linhas nunca tiveram previsto). `pagarFolhaProjetista` faz o mesmo para toda linha zerada do lote. **Existem linhas de R$ 0,00 em produção hoje.** |
| **D23** | **`fieldErrors` nunca é consumido.** Os 4 dialogs desta tela usam só `toast.error(r.error)` — o gap central da spec [`2026-08-27-formularios-boas-praticas.md`](../specs/2026-08-27-formularios-boas-praticas.md). |

---

## 3. Decisões travadas (dono, 2026-09-10)

| # | Decisão | Consequência |
| --- | --- | --- |
| **N1** | **Dois modos de leitura, alternáveis:** "por projetista" (agrupado) e "por pagamento" (tabela plana). Estado na URL. | Resolve os dois usos reais — "quanto eu devo ao João" e "cadê aquela entrega". Custa uma agregação server-side a mais (F3). |
| **N2** | **Lotes mensais vão para uma aba separada** ("A pagar" · "Lotes mensais"). | Mata D1 de raiz: o título passa a ser da página, as abas ficam abaixo dele. Lotes deixam de roubar o topo. |
| **N3** | **Conta obrigatória, forma opcional** ao efetivar pagamento. | Muda o schema Zod de `pagarProjetista` e `pagarFolhaProjetista`. Confinado à F5. Conta é o que quebra a conciliação; forma é descritiva. |
| **N4** | **Rótulo visível único = "Produção"** em toda superfície (título, aba, tile do hub, manual). **A rota `/financeiro/folha-projetistas` não muda.** | Renomear rota quebraria links salvos, `revalidatePath` em 5 actions e o histórico de `AuditLog`. O custo não paga o ganho. |
| **N5** | **`StatusFolhaProjetista.aberta` fica no enum, some da UI.** | Remover valor de enum é migração destrutiva sobre produção — e a memória `drop-tabela-prod-junto-com-deploy` registra o que isso já custou aqui. Documenta-se como valor morto; tornar "abrir lote" um passo real fica fora de escopo. |

---

## 4. Fases

Cada fase é entregável sozinha e deixa a tela funcionando.

### F0a — Trava de R$ 0,00 · *bug com dado real em produção — vai primeiro*

Resolve **D25**. Pequena, isolada, e é a única fase que impede dano contábil novo.

1. **Guarda nas duas actions:** `pagarProjetista` recusa `valor <= 0` com `ActionError("Este pagamento está sem valor — corrija o valor antes de pagar.")`. `pagarFolhaProjetista` **não paga** as linhas zeradas do lote: paga as demais e devolve quantas ficaram de fora (o lote não vira `paga` enquanto sobrar linha pendente).
2. **Na tela:** linha zerada perde o botão "Pagar" e ganha **"Corrigir valor"** como ação primária (abre o `EditarValorDialog` que já existe — é exatamente a rota de conserto para a qual ele foi escrito). Badge **"Sem valor"**.
3. **Aviso no topo** quando houver linha zerada pendente: "N pagamentos sem valor — corrija antes de pagar".
4. **Levantamento do estrago já feito:** consulta somente-leitura por `Lancamento` confirmado de R$ 0,00 com `pagamentoProjetistaId` preenchido. Se houver, o dono decide (cancelar o lançamento zerado ou deixar); nada é apagado automaticamente.
5. Teste cobrindo as duas guardas (entra no `service.test.ts` da F6, ou antecipa o arquivo).

### F0 — Esqueleto, abas e nomes · *sem tocar em query nem em action*

Resolve **D1, D2, D3, N2, N4**.

1. `<h1>Produção</h1>` + descrição sobem para `page.tsx` (RSC). Saem de `folha-view.tsx`.
2. Abas `?aba=pagar|lotes` (default `pagar`) com `components/ui/tabs.tsx`, lidas **no servidor** a partir de `searchParams`, para o link ser compartilhável. **Divergência deliberada** de `contas-pagar-receber-view` (servidor passa `tabInicial`, cliente guarda em `useState`) — não "corrigir" de volta. Consequência: `page.tsx` busca **só os dados da aba ativa**, em vez do `Promise.all` com as 3 queries a cada render.
3. Rótulo "Produção" no `metadata.title`, no `<h1>`, no tile do hub e no manual.
4. Mapa de rótulos de status (`pendente → "A pagar"`, `pago → "Pago"`, `cancelado → "Cancelado"`).

### F1 — Camada de dados · **paginar e agregar são o mesmo trabalho**

Resolve **D11, D12, D13, D14**. **Nenhuma fase seguinte pode paginar antes desta.**

1. `listarFolha` passa a receber `parseListParams(searchParams)` + filtros, e devolve `{ itens, total, resumo }`.
2. **O `resumo` vem de `prisma.pagamentoProjetista.groupBy({ by: ["status"], _sum: { valor } })`**, consulta separada do `findMany`. Nunca mais de `.reduce()` sobre a página. O mesmo `groupBy` entrega de graça o **terceiro card de KPI, "Cancelado"** (hoje esse valor não aparece em lugar nenhum) — ele fica aqui e **não** na F0, porque na F0 só daria para somá-lo no cliente, que é o próprio D11 com outro nome.
3. `listarFolhasProjetista` troca o `include` por `_count` + `groupBy` por status; paginação vai para `skip`/`take` no servidor.
4. Usa o parâmetro `opts.status` que já existe (D13) em vez de deixá-lo pendurado.
   **Atenção (herdado da F0a):** o `semValor` de `listarFolha` conta com `where` fixo (`pendente` + `valor <= 0`), ignorando filtros. Quando os filtros forem ligados, decidir se o aviso reflete o recorte filtrado ou continua global — e dizer isso no texto do aviso.
5. **Índice: não criar.** Produção tem 15 linhas (§1). Reavaliar só se passar da casa dos milhares.

### F2 — Tabela "por pagamento"

Resolve **D4, D5, D6, D7, D8, D9, D24**.

0. **Tudo clicável (D24) — o item de maior valor desta fase:**
   - projeto → `/projetos/[id]`; disciplina → aba da disciplina no projeto; projetista → ficha da pessoa.
   - linha paga mostra **Conta** e **Pago em**, e linka para o `Lancamento` (`lancamentoId`) no livro caixa.
   - linha pendente mostra se já existe lançamento **previsto** ou não (linhas zeradas não têm).
   - É isso que torna respondível a pergunta aberta §7.3 — hoje o dono não consegue verificar.

1. Filtros: status (**default esconde `cancelado`**, com contador "N cancelados ocultos"), projetista, projeto, período de liberação, busca livre.
2. `sortable-head` em projetista, valor, `liberadoEm`.
3. Colunas novas: **Liberado em** e **Pago em**. Pendente parado há mais de X dias ganha marcação discreta (mesma ideia de `venceEm()` em `contas-pagar-receber-view`).
4. `observacao` visível e editável no dialog de edição (hoje é campo morto).
5. `Pagination` no rodapé.
6. **Seleção múltipla → "Pagar selecionados"**: nova action modelada em `baixarEmLote`, obrigatoriamente `permissao: "folha_pj"` (**não** `gerir` — a separação foi deliberada, spec [`2026-09-02-ampliacao-escopo-permissoes.md`](../specs/2026-09-02-ampliacao-escopo-permissoes.md)). Duas regras desde o nascimento:
   - **Notificação deduplicada por projetista.** `pagarProjetista` dispara um `notificar()` por pagamento — reusar esse caminho num loop manda 12 pushes para quem teve 12 entregas pagas. Copiar o que `pagarFolhaProjetista` já faz: `[...new Set(ids de projetista)]` + `notificarMuitos(..., { categoria: "pagamento" })`.
   - **`contaId: z.string().min(1)` já na criação** (N3 está decidido). Não nascer opcional para ser corrigido na F5 — a F5.2 fica só com as duas actions pré-existentes.

### F3 — Modo "por projetista" (N1)

1. Toggle `?modo=projetista|pagamento`, default **`projetista`**.
2. Linha-mãe: projetista · nº de entregas · total pendente · botão "Pagar tudo". Expande nas disciplinas.
3. Agregação por `groupBy({ by: ["projetistaId", "status"] })` — não somar no cliente (mesma armadilha de D11).
4. "Pagar tudo do projetista" reusa a action em lote da F2 com o conjunto de ids do grupo — herda dela a notificação única por projetista e a conta obrigatória.

### F4 — Aba de lotes · *toca em `folha-lote/actions.ts`*

Resolve **D16, D17, D18** + paginação server-side.

1. Form de geração: `Select` de mês com nome + `Input` de ano, ambos com `<Label>`. Default mês anterior (já é hoje).
2. **"Nenhum pagamento liberado no mês fora de lote" deixa de ser `ActionError`** → retorno `ok` com `vinculados: 0` e toast neutro. Desfecho rotineiro não é erro vermelho.
3. Lotes viram lista paginada no servidor, com coluna de progresso (`pagos/qtd`) e total.
4. `aberta` some da UI (N5); o `TONE` deixa de mapear valor morto.

### F5 — Dialogs: dedup, conta obrigatória, `fieldErrors`

Resolve **D15, D19, D20, D23** + **N3**.

1. Extrair **`<EfetivarPagamentoDialog>`** compartilhado (conta / forma / data) usado pelo pagamento único, pelo lote e pelo "pagar selecionados".
2. **Conta obrigatória, forma opcional** (N3): `contaId: z.string().min(1)` em `pagarProjetista` e `pagarFolhaProjetista`. **Verificar antes se existe lançamento histórico sem conta** — se existir, a mudança vale só para o caminho novo, sem retroação.
3. **Esta tela vira o caso de referência da opção A da spec de formulários:** consumir `fieldErrors` do `ActionResult`, marcar `aria-invalid` e renderizar a mensagem sob o campo. O dado e o estilo já existem; só falta ligar o fio.
4. `MESES` sai das duas cópias para um único lugar (`lib/utils.ts` ou `lib/data.ts`).

### F6 — `service.ts` + testes

Resolve **D21, D22**.

1. Criar `modules/financeiro/folha/service.ts` com a lógica pura hoje espalhada pelas actions (recálculo de total, regra de transição de status, elegibilidade para lote).
2. **`recalcularTotalFolha` passa a ser único**, usado também por `gerarFolhaDoMes` (D22).
3. **Primeiros testes do módulo** (`service.test.ts`): recálculo excluindo cancelados, transições inválidas (pagar pago, editar cancelado), agregação de lote.

### F7 — Exportação + manual

1. `GET /api/financeiro/folha-projetistas/export` (CSV/XLSX), espelhando `contas/export`, respeitando os filtros ativos.
2. Atualizar `docs/manual/financeiro/README.md` e `docs/manual/search-index.json` — obrigatório pelo `CLAUDE.md`.

---

## 5. O que **não** se mexe

As actions estão corretas e são carga estrutural. Cada uma destas linhas carrega comentário
explicando por que é assim — não "limpar":

- **`status: "pendente"` explícito** (nunca `!= pago`) em `gerarFolhaDoMes` e `pagarFolhaProjetista`. Cancelado solto do lote não pode ser recolhido nem pago junto.
- **`folhaId: null` ao cancelar** — é o par da trava acima.
- **`sincronizarValorDisciplina(tx, disciplinaId)`** ao editar e ao cancelar. Sem isso, o próximo toque na disciplina desfaz o ajuste em silêncio.
- **`confirmarDespesaProjetista` / `criarDespesaProjetistaPrevista`** — a regra anti-duplicação do lançamento previsto.

**Não adicionar "editar o valor da disciplina" por esta tela.** A sincronização hoje tem dois
sentidos com papéis distintos (`modules/uploads/pagamento.ts`):
- `sincronizarPagamentosDisciplina` — `Disciplina.valor` → rateio entre os pagáveis (cria/cancela/atualiza pagamentos);
- `sincronizarValorDisciplina` — após editar/cancelar um pagamento, `Disciplina.valor` volta a ser **a soma dos pagamentos vivos**.

A invariante é "pool = soma dos vivos". Editar a disciplina daqui abriria um terceiro caminho
que dispara o rateio por cima de ajustes manuais. O único caminho de escrita desta tela continua
sendo o valor **do pagamento**.

**Permissão:** toda action nova usa `permissao: "folha_pj"`. `gerir` é o mesmo interruptor de
lançar boleto — a separação foi o recorte da F4 de 2026-09-02.

---

## 6. Ordem sugerida e por quê

```
F0a ──► F0 ──► F1 ──► F2 ──► F3
                │      └──► F5 (depende de F2 p/ "pagar selecionados")
                └──► F4 (independente de F2/F3)
F6, F7 ao final
```

**F0a primeiro** porque é o único item que para dano contábil em curso (R$ 0,00 em produção).
F0 em seguida: risco zero, conserta o defeito mais visível (título no meio da página).
F1 antes de qualquer coisa que pagine — D11 é silencioso. Com 15 linhas em produção, **a parte
de paginação da F1 pode até ficar para depois**; a parte de agregação (`groupBy`) não, porque a F3
depende dela.
**Dentro da F2, o item 0 (clicável) vem antes de filtros** — com 15 linhas, rastreabilidade vale
mais que filtro. F3 é o maior ganho de UX e depende só de F1.

---

## 7. Perguntas de dado

1. ~~Volume em produção~~ — **respondido: 15 pagamentos.** Paginação e índice deixam de ser prioridade (§1, F1.5).
2. ~~Linhas de R$ 0,00 em produção~~ — **respondido: existem.** Virou a fase F0a e o achado D25.
3. **Existe lançamento histórico sem conta?** — **sem resposta, e a própria falta de resposta é um achado (D24):** a tela não deixa chegar ao lançamento. Duas saídas, não excludentes:
   - **Agora:** consulta somente-leitura em produção — pagamentos `pago` cujo `Lancamento` tem `contaId` nulo — rodada junto com o levantamento da F0a.4.
   - **Permanente:** F2.0 mostra a conta em cada linha paga e linka o lançamento.

   Até lá, **N3 vale só daqui para frente** — nenhum lançamento antigo é alterado.

---

## 8. Branch

A branch atual (`feat/guias-de-uso`) tem ~25 arquivos modificados não commitados de trabalho
**não relacionado** (certidões, soft delete, `nav-badge`, `metadata-publica`). Escrever este plano
aqui é inofensivo; **implementar em cima desta pilha não é.**

Pela regra do repo (memória `workflow-branch-dev`): refatoração grande sai em
**`feat/folha-projetistas` a partir de `dev`**, com a pilha atual resolvida antes.
