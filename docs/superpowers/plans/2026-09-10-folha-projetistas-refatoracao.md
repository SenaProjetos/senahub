# Plano — Refatoração de `/financeiro/folha-projetistas` (Produção)

- **Data:** 2026-09-10
- **Origem:** dono pediu revisão de UI/UX e de funções da tela.
- **Estado:** **F0a a F12 entregues — plano original e backlog pós-smoke completos.** `tsc`, `eslint`, testes e `smoke:sync-pagamento` (19/19) verdes em todas. §7.3 já respondido em produção (0 pagamentos sem conta). Falta só o smoke completo em navegador com login real (checklist publicado como artefato, atualizado até a F12) e o merge de `feat/folha-projetistas` em `dev`. Detalhe de cada fase na própria seção; F8–F12 estão na §9 "Backlog pós-smoke".
  - **Falta smoke em navegador nas três fases**, com login de verdade — sem sessão o `middleware` redireciona pra `/login` antes de renderizar a página (confirmado: `next dev` compilou e serviu o 307 sem erro, mas isso não exercita `page.tsx`/`FolhaView`/`ProducaoAbas`). Criar sessão de teste (reset de senha do admin, ou usuário próprio) não é decisão para tomar sozinho num banco de dev compartilhado — fica para quem tem credencial.
  - **O banco de dev agora tem dado pra testar as duas abas de propósito:** 1 pagamento pendente zerado (F0a) e 1 lote real, 2026-04, com 3 pagamentos — 2 pagáveis + a linha zerada dentro dele. Isso deixa testável: aviso no topo (nas duas abas), badge "sem valor", botão "Corrigir valor", aba de lotes com conteúdo (antes mostrava "Nenhum lote gerado"), "Pagar lote" deixando a linha zerada de fora, e o 3º card de KPI "Cancelado" (ainda R$ 0 — nenhum pagamento cancelado em dev).
  - F0: conferir a troca de aba (`?aba=pagar` ↔ `?aba=lotes`) e que o título "Produção" aparece uma vez só, no topo.
  - F1: conferir a paginação da tabela de pagamentos (`?page=`) e que os 3 cards de KPI não mudam ao trocar de página (são globais, não somados da página visível).
  - O `smoke:sync-pagamento` não chama as actions de pagar nem renderiza páginas (exige sessão) — cobre só a camada de dados. As duas queries da F1 foram conferidas à parte, contra o banco de dev, com uma soma independente feita fora da própria query (ver F1 acima) — não é a mesma coisa que abrir a tela, mas é mais forte que só `tsc` passar.
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
2. Abas `?aba=pagar|lotes` (default `pagar`) com `components/ui/tabs.tsx` + `useSetParams` (mesmo padrão de `orcamento-detalhe-view`/`bancos-view`), lidas **no servidor** a partir de `searchParams`, para o link ser compartilhável. **Divergência deliberada** de `contas-pagar-receber-view` (servidor passa `tabInicial`, cliente guarda em `useState`) — não "corrigir" de volta. Consequência: `page.tsx` busca **só os dados da aba ativa**, em vez do `Promise.all` com as 3 queries a cada render. Aba nomeada **"Pagamentos"**, não "A pagar" — a lista mostra pendente+pago+cancelado, "A pagar" fica só para o KPI e o badge, onde é literal.
3. Rótulo "Produção" no `metadata.title`, no `<h1>`, no tile do hub e no manual.
4. Mapa de rótulos de status (`pendente → "A pagar"`, `pago → "Pago"`, `cancelado → "Cancelado"`) em `modules/financeiro/folha/status.ts` (mesmo formato de `modules/custos/status.ts`).
5. **O aviso "N pagamentos sem valor" (F0a) é da PÁGINA, não da lista** — hoisted pra `page.tsx`, acima das abas, visível nas duas. Antes vivia dentro de `FolhaView` e ficava invisível na aba de lotes, que é justamente onde "Pagar lote" pode tropeçar nele. `contarPendentesSemValor()` (novo, `folha/queries.ts`) é chamado nas duas ramificações — pequena exceção ao "sem tocar em query" do título desta fase, mas é aditiva e não muda a forma de nenhuma query existente.
6. Conferido: `Pagination` já usa `useSetParams` internamente (preserva `aba` ao trocar de página) — sem risco de a paginação da aba de lotes derrubar a aba ativa.

### F1 — Camada de dados · **paginar e agregar são o mesmo trabalho** ✅ entregue 2026-09-10 (Sonnet 5)

Resolve **D11, D12, D13, D14**. **Nenhuma fase seguinte pode paginar antes desta.**

1. `listarFolha(sp)` passa a receber os `searchParams` crus (mesmo idioma de `custos/composicoes/queries.ts`: a própria função chama `parseListParams` por dentro, o chamador só repassa `sp`) e devolve `{ itens, total, page, pageSize, resumo }`.
2. **O `resumo` vem de `prisma.pagamentoProjetista.groupBy({ by: ["status"], _sum: { valor } })`**, consulta separada do `findMany`, sobre o mesmo `where` (não sobre a página). Nunca mais de `.reduce()` sobre a página. O mesmo `groupBy` entrega de graça o **terceiro card de KPI, "Cancelado"** (hoje esse valor não aparece em lugar nenhum) — ele fica aqui e **não** na F0, porque na F0 só daria para somá-lo no cliente, que é o próprio D11 com outro nome.
   Conferido contra o banco de dev com uma soma independente (`aggregate` bruto sobre TODOS os status): `resumo.pendente+pago+cancelado` bate exatamente com a soma bruta (R$ 115.000 nos dois lados).
3. `listarFolhasProjetista(sp)` troca o `include: { pagamentos: {...} }` por dois `groupBy` (`by: ["folhaId","status"]` para qtd/pagos; `by: ["folhaId"]` com `where: {status:"pendente", valor:{lte:0}}` para `semValor`) sobre os ids da página, e passa a devolver `{ folhas, total, page, pageSize }` em vez de um array solto. **Conferido contra um lote real criado no dev** (2026-04, 3 pagamentos incluindo a linha zerada da F0a): `qtd/pagos/semValor/pagaveis` bateram um a um contra uma contagem direta e independente. Esse lote **fica no banco de dev de propósito** — sem ele a aba de lotes mostra "Nenhum lote gerado" e não dava pra testar nada nela.
4. `listarFolha` agora lê `?status=` (`pendente|pago|cancelado`) diretamente da URL, validado contra os 3 valores — fecha o D13 (o parâmetro existia e nada o alimentava). Sem Select ainda (isso é F2); já funciona se alguém digitar a URL.
   **Atenção (herdado da F0a):** o `semValor` do aviso de página (`contarPendentesSemValor()`) continua com `where` fixo, ignorando `?status=`. Quando a F2 ligar o Select de status, decidir se o aviso deve refletir o recorte filtrado ou continuar global — e dizer isso no texto do aviso.
5. **Índice: não criar.** Produção tem 15 linhas (§1). Reavaliar só se passar da casa dos milhares.
6. **Pagination adiantada da F2** em `FolhaView` (a tabela de pagamentos) — o item formal "zero paginação" (D5) está listado como F2, mas mudar `listarFolha` pra `skip`/`take` sem nenhum controle de página na tela teria truncado a lista em 12 linhas sem forma de ver o resto. Reusa `<Pagination>` (mesmo componente que já existia em `FolhaLotesSection`). **F2 não tem mais esse item** — ver abaixo.
7. `FolhaLotesSection` parou de fatiar `folhas` no cliente (`useSearchParams` + `.slice()`) — a página já vem pronta do servidor; o componente só exibe `folhas`/`total`/`page`/`pageSize` recebidos como prop. Tipo local `Folha` duplicado foi trocado pelo `FolhaLoteItem` exportado de `folha-lote/queries.ts`.

### F2 — Tabela "por pagamento" ✅ entregue 2026-09-10 (Opus 5)

Resolve **D4, D6, D7, D8, D9, D24** (D5 — paginação — já saiu na F1, ver item 6 acima).

**Como ficou (registro da entrega):**
- **`?status=` mudou de significado.** Na F1, ausente = sem filtro. Agora ausente = **padrão, esconde cancelados**; `?status=todos` mostra tudo. Link salvo antes da F2 passa a esconder cancelados.
- **Dois `where` em `listarFolha`, de propósito:** a tabela (e `total`/paginação) respeita o status; os **cards de totais não** — são o desdobramento por status do recorte filtrado. Senão o card "Cancelado" ficaria sempre zerado no padrão e não haveria de onde contar "N cancelados ocultos". A tela diz isso numa linha embaixo dos cards; o comentário na query diz para não unificar.
- **Links condicionados à permissão de cada destino** (`projetos:ver`, `rh:cadastro`, `financeiro:ver`), calculados em `page.tsx` — quem só tem `folha_pj` vê texto, não um link que cai em "sem permissão". Pessoa → `/rh/pessoas/[userId]`; projeto → `/projetos/[id]/disciplinas` (a aba não aceita foco numa disciplina — o link cai na lista).
- **Lançamento:** `/financeiro/lancamentos?lancamento=<id>` abre o detalhe que já existia no livro caixa (mudança mínima em `LancamentosView`: prop `defaultDetalheId` semeando o `useState`). Não há FK entre `PagamentoProjetista` e `Lancamento` — `listarFolha` faz uma 2ª consulta pelos dois vínculos soltos (`lancamentoId` e `pagamentoProjetistaId`), igual a `confirmarDespesaProjetista`.
- **`pagarProjetistasSelecionados`** (nova): `folha_pj`, conta obrigatória no schema desde o nascimento, **relê tudo dentro da transação** (só `pendente` + valor > 0 — a guarda da F0a não ganha porta lateral) e **reserva cada linha com `updateMany where status=pendente` antes de gerar o lançamento** (envio duplicado concorrente pula em vez de pagar de novo). Uma notificação por projetista. Fallback de data = `inicioDoDiaUtc()`, não `new Date()` (ver bug abaixo).
- **`observacao`** editável no dialog de edição e entrou no `capturarAntes` (o diff de auditoria mostra o campo).
- **`EfetivarPagamentoDialog`** nasceu aqui (só o "Pagar selecionados" usa); a F5 migra os outros dois.
- Regras puras novas em `folha/service.ts`, com teste: `lerFiltrosFolha`, `whereDoStatus`, `temFiltroAlemDoStatus`, `diasPendenteParado` (limite em `DIAS_PENDENTE_PARADO = 30`, via `lib/data.ts`).

**Verificação:** `tsc`, `eslint`, 77 testes do financeiro, `smoke:sync-pagamento` 19/19, e **conferência independente contra o banco de dev** (todas as linhas buscadas uma vez e cada filtro refeito em JS, sem reusar a query): padrão/todos/pago, cancelados ocultos, totais ignorando status, projetista, projeto, período, busca, ordenação, paginação sem sobreposição, opções de filtro — 19/19.
- **Não executado:** a action `pagarProjetistasSelecionados` em si (exige sessão). A releitura e a reserva estão no código e na revisão; o smoke em navegador cobre.
- **Achado no dev:** os 7 "pagos" do `seed:demo` **não têm lançamento nenhum** (nem por vínculo, nem entre excluídos) — o seed cria `status: "pago"` sem passar pelo fluxo real. Na tela eles aparecem como "sem lançamento" (correto). Para exercitar o caminho principal da coluna, **1 pendente de dev foi pago pela mesma transação de `pagarProjetista`**, numa conta real: `listarFolha` achou o lançamento, conta e status confirmados.
- **Dado de dev deixado para o smoke:** 1 pendente zerado (F0a), lote 2026-04 com a linha zerada (F1), **1 cancelado** (`cmr74tx...`, R$ 4.000 — o "N cancelados ocultos" tem o que mostrar) e **1 pago com lançamento real** (`cmr5skcyt...`, R$ 10.000).
- **Revisão pós-entrega (4 pontos checados):**
  1. *"Pagar selecionados" pode quitar um lote inteiro sem fechá-lo* — `FolhaProjetista.status` fica `fechada` e `pagaEm` nulo (o pagamento individual sempre fez o mesmo). **Conferido: nada fora de `modules/financeiro/folha*` lê `status === "paga"` nem `pagaEm`** (só `uploads/pagamento.ts` toca o lote, e só para recalcular `total`); a aba de lotes deriva "paga" de `todosPagos`. Cosmético hoje — se algum relatório passar a ler o status gravado, é aqui que dá errado.
  2. *Tag de notificação por dia* (`pagos-selecionados-<data>`) — **conferido: `lib/notificar.ts` só repassa o `tag` para o web push** (substitui o aviso na tela); a linha de `Notificacao` é sempre criada. Dois pagamentos em massa no mesmo dia → o 2º push substitui o 1º na tela, nada se perde.
  3. *Sem `entidadeId` na action em massa* (igual a `baixarEmLote`) — **conferido: o histórico do projeto não inclui `PagamentoProjetista` e a auditoria não filtra por ele**; o registro do `AuditLog` guarda o input inteiro em `detalhe`, então os `ids` pedidos ficam na trilha (os ignorados não aparecem separados).
  4. A data do lançamento do pago feito por script saiu **11/09** (o bug de fuso abaixo); **corrigida no dev para 10/09** para o smoke não reportar como defeito da F2.
- **Smoke em navegador — o item que não falha visível:** o **select de Conta do "Pagar selecionados"** (`EfetivarPagamentoDialog`, `contaObrigatoria`). Confere: abre sem conta escolhida mostrando "Escolha a conta", o botão fica desabilitado até escolher, e o lançamento sai com a conta escolhida. É o único ponto da F2 que depende de comportamento do base-ui que o `tsc` não prova (valor `null` mostrando o placeholder).
- **Para a F6:** testar a partição e a reserva de `pagarProjetistasSelecionados` (única lógica nova da F2 que nunca rodou — a action exige sessão). O padrão de reserva já é provado no repo pelo `smoke:aviso-agendado`.
- **Bug pré-existente encontrado (vai para a F5):** `PagarDialog` e `PagarLoteDialog` preenchem a data padrão com `new Date().toISOString().slice(0,10)` — depois das 21h em BRT isso é **amanhã**, e o lançamento sai datado errado. O fallback `new Date()` das duas actions antigas tem o mesmo defeito. O `EfetivarPagamentoDialog` já usa o dia local; migrar os dois dialogs na F5 resolve a parte da tela.

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

### F3 — Modo "por projetista" (N1) ✅ entregue 2026-09-11 (Sonnet 5)

1. Toggle `?modo=projetista|pagamento`, default **`projetista`**.
2. Linha-mãe: projetista · nº de entregas · total pendente · botão "Pagar tudo". Expande nas disciplinas.
3. Agregação por `groupBy({ by: ["projetistaId", "status"] })` — não somar no cliente (mesma armadilha de D11).
4. "Pagar tudo do projetista" reusa a action em lote da F2 com o conjunto de ids do grupo — herda dela a notificação única por projetista e a conta obrigatória.

**Como ficou (registro da entrega):**
- **`listarFolhaAgrupada` NÃO pagina** — traz tudo agrupado de uma vez (§1: volume pequeno o bastante). `?sort=`/`?dir=` (da F2) são ignorados neste modo de propósito — não fazem sentido ordenando grupos de pessoa, não linhas.
- **`qtd` respeita o filtro de status** (é a lista que o grupo mostra expandido); **`totalPendente` NÃO respeita** — mesma regra dos 3 cards de KPI (F2): filtrar `status=pago` não devia fazer "quanto devo a essa pessoa" sumir do cabeçalho do grupo. Os dois vêm de `groupBy` no banco, nunca de somar `itens` na mão.
- **Refatoração de reuso, não just F3:** os pedaços que os dois modos compartilham (filtros, os 3 cards de KPI, `PagarDialog`, `EditarValorDialog`, badge de status, botões de ação de linha, célula "Pagamento") saíram de `folha-view.tsx` para `folha-linhas-compartilhadas.tsx`. `FolhaResumoFiltros` (filtro + KPI) subiu para `page.tsx` — é a MESMA barra nos dois modos, não faz sentido cada view desenhar a sua.
- **Achado durante a implementação, corrigido antes do commit:** a 1ª versão do cabeçalho do grupo botão "Pagar tudo" DENTRO do `CollapsibleTrigger` (que já é um `<button>`) e, na correção, o LINK do nome também ficou dentro dele — mesmo defeito, disfarçado (botão-dentro-de-botão vira link-dentro-de-botão). Corrigido: nome-link e botão "Pagar tudo" são irmãos do trigger, fora dele; **só entra dentro do trigger quando não há link** (quem não tem `rh:cadastro` continua com a linha inteira clicável para expandir).
- **Um só conjunto de dialogs para todos os grupos**, no componente de topo (`FolhaAgrupadaView`), não um conjunto por grupo — `PagarDialog`/`EditarValorDialog`/`EfetivarPagamentoDialog` usam ids fixos de campo (`valor-pagamento`, `efetivar-conta`...); um conjunto por grupo duplicaria esses ids e o `htmlFor` de um rótulo no grupo 3 focaria o campo do grupo 1.

**Verificação:** `tsc`, `eslint`, 77 testes do financeiro, `smoke:sync-pagamento` 19/19, e conferência independente contra o banco de dev (agrupamento refeito em JS puro, sem reusar a query): nº de grupos, qtd e soma de itens por pessoa no padrão, `totalPendente` batendo com o pendente real mesmo filtrando `status=pago`, nº de grupos com `status=todos`, paridade de `resumo`/`canceladosOcultos` com o modo flat — 18/18.
- **Não executado:** abrir a tela de verdade (exige sessão). Dois pontos para o smoke em navegador: (1) o chevron gira ao expandir (`data-panel-open` do base-ui — o mesmo mecanismo de `CollapsibleSection`, aqui escrito à mão); (2) a primeira impressão do modo padrão novo — a tela abre agora em grupos recolhidos por pessoa, não mais na tabela plana.

### F4 — Aba de lotes · *toca em `folha-lote/actions.ts`* ✅ entregue 2026-09-11 (Sonnet 5)

Resolve **D16, D17, D18** + paginação server-side.

1. Form de geração: `Select` de mês com nome + `Input` de ano, ambos com `<Label>`. Default mês anterior (já é hoje).
2. **"Nenhum pagamento liberado no mês fora de lote" deixa de ser `ActionError`** → retorno `ok` com `vinculados: 0` e toast neutro. Desfecho rotineiro não é erro vermelho.
3. Lotes viram lista paginada no servidor, com coluna de progresso (`pagos/qtd`) e total.
4. `aberta` some da UI (N5); o `TONE` deixa de mapear valor morto.

**Como ficou (registro da entrega):**
- **Item 3 já tinha saído na F1** (`listarFolhasProjetista` com `groupBy` + `Pagination` em `FolhaLotesSection`) — não refeito aqui, só confirmado que segue de pé.
- **`gerarFolhaDoMes` muda de contrato**: `{ id: string | null, vinculados: number }` em vez de lançar `ActionError` quando o mês não tem pagamento fora de lote. `id` é `null` só nesse caso e nunca existiu lote pro mês; se já existia (mês já coberto), devolve o `id` existente. Único chamador é `FolhaLotesSection.gerar()` (conferido: `grep -rn gerarFolhaDoMes src` só aparece na action e nesse componente) — `vinculados === 0` vira `toast.info`, o resto continua `toast.success` + `router.refresh()`.
- **`TONE`**: de `Record<"fechada"|"paga", "success"|"warning">` (quebrava `tsc`, TS7053 — `f.status` é o enum inteiro do Prisma, que inclui `"aberta"`) para `Partial<Record<string, "success"|"warning">>`; `aberta` fica de fora do objeto de propósito (N5: o enum continua existindo no banco — `gerarFolhaDoMes` nunca cria um lote nesse status — só não vira um badge na tela). O `?? "neutral"` que já existia cobre a ausência.
- Mês vira `Select` com nome (usa o array `MESES` já existente); ano ganha `<Label htmlFor>` — sem mudança de comportamento, só rótulo/semântica de formulário.

**Verificação:** `tsc`, `eslint`, 77 testes do financeiro (nenhum teste puro novo — F4 não mexeu em `service.ts`), `smoke:sync-pagamento` 19/19, e conferência independente (script temporário replicando a leitura de `gerarFolhaDoMes` direto no banco, já que a action exige sessão): mês vazio de propósito (2999) → `{id: null, vinculados: 0}`; mês 2026-04 (lote de teste da F1/F3, sem pagamento novo fora de lote) → `{id: <id do lote existente>, vinculados: 0}`. Script apagado depois de rodar.
- **Não executado:** gerar um lote de verdade pela tela (exige sessão) — o smoke em navegador é quem prova o toast neutro (não vermelho) no caminho `vinculados: 0`, que é a metade visível do D17 e só se confirma ali.

### F5 — Dialogs: dedup, conta obrigatória, `fieldErrors`

Resolve **D15, D19, D20, D23** + **N3**.

1. **Migrar os dois dialogs restantes** (pagamento único em `folha-view.tsx`, lote em `folha-lotes-section.tsx`) para o **`<EfetivarPagamentoDialog>`** que já nasceu na F2 (`components/financeiro/folha/efetivar-pagamento-dialog.tsx`, usado hoje só pelo "Pagar selecionados", com `contaObrigatoria`). Não extrair de novo.
2. **Conta obrigatória, forma opcional** (N3): `contaId: z.string().min(1)` em `pagarProjetista` e `pagarFolhaProjetista`. **Verificar antes se existe lançamento histórico sem conta** — se existir, a mudança vale só para o caminho novo, sem retroação.
3. **Esta tela vira o caso de referência da opção A da spec de formulários:** consumir `fieldErrors` do `ActionResult`, marcar `aria-invalid` e renderizar a mensagem sob o campo. O dado e o estilo já existem; só falta ligar o fio.
4. `MESES` sai das duas cópias para um único lugar (`lib/utils.ts` ou `lib/data.ts`).

**✅ entregue 2026-09-11 (Opus 5) — como ficou:**
- **Um dialog só.** `EfetivarPagamentoDialog` agora atende os 4 caminhos (individual, lote, selecionados, "pagar tudo"). `PagarDialog` e `PagarLoteDialog` viraram invólucros finos (só título, descrição e o que fazer no sucesso). Contrato novo: o chamador devolve o `ActionResult` em `onConfirmar`; o dialog cuida do `pending`, do erro de campo e do toast de erro. Os chamadores não guardam mais `useTransition`. Os ids dos campos saem de `useId`, então dois dialogs no DOM não colidem mais.
- **Conta obrigatória nas 3 actions (N3)**, pelo mesmo schema: `folha/schemas.ts` (`contaPagamento`, `formaPagamento`, `dataPagamento`). Ele fica fora do `actions.ts` porque arquivo "use server" só pode exportar função. Vale daqui pra frente, sem retroação. O §7.3 (existe lançamento antigo sem conta em produção?) continua a cargo do script de levantamento — a mudança não depende da resposta. Na tela, o botão de confirmar fica **habilitado** e, sem conta, mostra o erro sob o campo e o foca: um botão desabilitado não diz por que não dá pra confirmar. Os únicos chamadores das duas actions antigas são esses dialogs (conferido com grep em `src` e `scripts`).
- **Data:** `quandoDoPagamento(data)` em `folha/service.ts`, com teste, é a regra única das 3 actions. Sem data no formulário, usa a meia-noite UTC do dia local. As duas actions antigas usavam `new Date()` — depois das 21h em BRT o lançamento saía datado do dia seguinte (bug anotado na F2). A tela já preenche o dia local.
- **Erro por campo (D23): primeira implementação da opção A da spec de formulários.** `lib/use-field-errors.ts` (`useFieldErrors`) + `components/ui/field-error.tsx` (`FieldError`): guarda os `fieldErrors`, marca `aria-invalid` (o estilo já existia em `Input`/`SelectTrigger`), liga a mensagem por `aria-describedby` e foca o primeiro campo com erro. Erro em chave que o formulário não mostra volta `false` e cai no toast de sempre. Ligado no dialog de efetivação (conta/forma/data) e no `EditarValorDialog` (valor/observação — o "valor maior que zero" saiu do toast e foi para baixo do campo).
- **Fronteira cliente/servidor (revisão pós-entrega):** `MSG_CONTA_OBRIGATORIA` fica em `folha/status.ts`, não em `schemas.ts` — o dialog (cliente) usa a mensagem, e importar de `schemas.ts` levaria o zod para o bundle do navegador (`tsc`/`eslint` não enxergam isso). `idDoErro` fica em `field-error.tsx` (sem "use client"), e o hook importa de lá — assim `FieldError` pode ser usado por um Server Component.
- **`MESES` → `MESES_CURTOS` em `lib/data.ts`** — trocado nos dois arquivos que o D20 cita (`folha-lotes-section`, `contas-pagar-receber-view`). As outras cópias iguais do repo (fechamento, lançamentos, RH) ficaram de fora, por escopo.
- **Achados na mesma função, corrigidos junto:**
  1. `pagarProjetista` só recusava `pago` — um `cancelado`, com a tela aberta desde antes do cancelamento, era pago e ganhava lançamento novo. Agora exige `pendente`.
  2. `pagarProjetista` e `pagarFolhaProjetista` passaram a **reservar cada linha** (`updateMany where status=pendente`) antes de gerar o lançamento, igual a `pagarProjetistasSelecionados`. O lote lia os pendentes **fora** da transação: se "Pagar selecionados" pagasse uma linha nesse meio-tempo, ela seria reconfirmada, sobrescrevendo a conta e a data do lançamento já pago. Agora a linha já paga é pulada, e o lote ganhou `timeout: 30_000` (mesmo motivo da action em massa).

**Verificação:** `tsc`, `eslint`, testes do financeiro + `lib/data` (104; novos: `quandoDoPagamento` e `schemas.test.ts` — conta vazia recusada com a mensagem do campo, data fora do formato vira erro do campo `data`) e `smoke:sync-pagamento` 19/19. O smoke precisa rodar **com a pasta principal como diretório atual**: o worktree não tem `.env`, e sem ele o `pg` cai em `localhost:5432`, a porta do sistema antigo.
- **Não executado:** as actions de verdade (exigem sessão). A reserva nas duas actions antigas não foi rodada — só revisada, e segue o padrão da F2. Os testes dela ficam para a F6, junto com os de `pagarProjetistasSelecionados`.
- **Smoke em navegador:** (1) sem escolher conta, "Efetivar" deixa o Select de Conta vermelho, com a mensagem embaixo e o foco nele; (2) em "Editar", valor 0 mostra o erro sob o campo, não um toast; (3) o lançamento de um pagamento feito depois das 21h sai com a data de hoje; (4) os Selects de Conta/Forma ganharam `w-full` (a base é `w-fit`), então a linha de duas colunas do dialog mudou de largura — conferir o layout.

### F6 — `service.ts` + testes ✅ entregue 2026-09-11 (Opus 5)

Resolve **D21, D22**.

1. Criar `modules/financeiro/folha/service.ts` com a lógica pura hoje espalhada pelas actions (recálculo de total, regra de transição de status, elegibilidade para lote).
2. **`recalcularTotalFolha` passa a ser único**, usado também por `gerarFolhaDoMes` (D22).
3. **Primeiros testes do módulo** (`service.test.ts`): recálculo excluindo cancelados, transições inválidas (pagar pago, editar cancelado), agregação de lote.

**Como ficou (registro da entrega):**
- **`folha/service.ts` já existia** (nasceu na F0a, cresceu na F2/F5). Nesta fase ganhou `erroTransicao(acao, status)`: pagar, editar e cancelar só valem para `pendente`. É a regra única das 3 actions, que antes repetiam o `if` inline. **Mensagens mantidas palavra por palavra** — nenhum texto de tela mudou.
- **D22 tinha três cópias, não duas:** além de `folha/actions.ts` e `gerarFolhaDoMes`, `uploads/pagamento.ts` (`sincronizarPagamentosDisciplina`) recalculava o total do lote do mesmo jeito. As três chamam agora `recalcularTotalFolha(tx, folhaId)`, no novo `folha-lote/service.ts`. A dependência `uploads → financeiro` já existia (`lancamento-custo`); não entrou acoplamento novo.
- **Contrato do `folha-lote/service.ts`** (escrito no cabeçalho): recebe `tx`, nunca importa `prisma` e nunca abre transação — o total precisa ser gravado na mesma transação de quem chama. Em `gerarFolhaDoMes`, total, `status` e `fechadaEm` continuam no mesmo `tx`, e um lote que já existia mantém o `fechadaEm` original.
- **`resumirLotes`** (pura) saiu de `listarFolhasProjetista`: junta os dois `groupBy` em `{qtd, pagos, todosPagos, semValor, pagaveis}`. `pagaveis` é o número que mostra ou esconde o "Pagar lote" e nunca tinha tido teste. Ganhou piso em 0 (defensivo — os zerados são subconjunto dos pendentes).
- **Testes:** `recalcularTotalFolha` com um `tx` falso (sem `vi.mock` — a função recebe o `tx` por parâmetro): o `where` exclui cancelados, e soma `null` grava 0. `resumirLotes`: lote misto, lote só com zerados (pagáveis 0), todos pagos, cancelado preso ao lote, linha de `groupBy` sem `folhaId`, contagem inconsistente, lote vazio. `erroTransicao`: as 9 combinações, mais um status desconhecido.

**Verificação:** `tsc`, `eslint`, 220 testes (financeiro + `lib/data` + uploads), `smoke:sync-pagamento` 19/19 (cobre a cópia de `uploads`: "total do lote recalculado", "lote zera após cancelar tudo") e conferência independente contra o banco de dev. Um script temporário comparou o resumo de `listarFolhasProjetista` com uma contagem linha a linha, e o total gravado com a soma dos não cancelados. Lote 04/2026: bate nos dois (R$ 17.000). Script apagado.
- **Limite da conferência:** o dev tem **um** lote, com 3 pagamentos. Os caminhos com vários lotes e com `folhaId` nulo em `resumirLotes` só são cobertos pelos testes unitários, não por dado real. Desta vez a conferência no banco foi mais estreita que os testes — o contrário das fases anteriores.

**Ficou de fora, de propósito:**
- **`efetivarPagamentos(tx, …)`** — o laço reserva → confirma lançamento → grava `lancamentoId` está repetido em `pagarProjetista`, `pagarFolhaProjetista` e `pagarProjetistasSelecionados`. Extraí-lo tornaria a reserva testável por smoke. Não entrou porque seria a **segunda reescrita do caminho do dinheiro em dois commits**, sem nenhuma execução real por trás — a reserva das duas actions antigas acabou de nascer na F5, também sem rodar. Fazer depois do smoke em navegador da F5, numa fase própria.
- **Smoke da reserva concorrente** — o laço vive dentro do handler da action (que exige sessão). Um script só testaria uma cópia do laço, não o código de verdade; depende da extração acima.

### F7 — Exportação + manual ✅ entregue 2026-09-11 (Sonnet 5 / manual em Sonnet 5)

1. `GET /api/financeiro/folha-projetistas/export` (CSV/XLSX), espelhando `contas/export`, respeitando os filtros ativos.
   **Reusar `lerFiltrosFolha` (`folha/service.ts`) e o mesmo `where` de `listarFolha` (`whereSemStatus` + `whereDoStatus`, `folha/queries.ts`) — não montar o filtro de novo.** Um `where` derivado de novo diverge da lista na primeira vez que um dos dois mudar, e o export passa a baixar linhas diferentes das que a tela mostra. Se `whereSemStatus` for privado, exportá-lo em vez de copiar.
2. Atualizar `docs/manual/financeiro/README.md` e `docs/manual/search-index.json` — obrigatório pelo `CLAUDE.md`.

**Como ficou (registro da entrega):**
- **GET, não POST+ids.** `contas/export` recebe uma seleção de ids de uma lista já carregada inteira no cliente — a Produção não tem essa lista (é paginada/agrupada no servidor). A rota lê os MESMOS search params da URL da tela e reconstrói o recorte no servidor, como `auditoria/export` já faz. "Espelhar `contas/export`" ficou nas colunas de planilha/CSV e no par de formatos, não no verbo HTTP.
- **`dadosFolhaExport` (`folha/queries.ts`)** é a única função nova de dados: mesmo `lerFiltrosFolha`/`whereSemStatus`/`whereDoStatus`/`ordenacao`/`comLancamentos` de `listarFolha`, sem paginar, teto de 5.000 linhas. Devolve `{itens, total, truncado}` — `truncado` vira uma linha de aviso no arquivo (CSV: última linha de texto; XLSX: linha em itálico) em vez de cortar em silêncio, o que seria o D11 com outro nome. Produção tem 15 linhas hoje — nunca dispara.
- **Colunas:** projetista, tipo, projeto, disciplina, valor, liberado em, status, pago em, conta, forma, observação — os mesmos dados que `CelulaPagamento` (D24) já mostra na tela, agora em planilha.
- **Botão `ExportarFolhaButton`** dentro de `FolhaFiltros` (não solto na página): usa `useSearchParams` só pra REPASSAR os filtros atuais pra URL da rota, nunca reconstrói o filtro no cliente. `<a href>`, não `fetch`+blob — é download simples.
- **Gate da rota espelha o da página, não só `folha_pj`:** `page.tsx` usa `requirePermission`, que inclui o piso de sócio (`can(...) || ehSocio && canRole("supervisor", ...)`, `lib/session.ts:131`). A rota não pode chamar `requirePermission` direto (ele redireciona; uma API precisa devolver JSON), então repete a mesma disjunção. Sem isso, um sócio abrindo a tela levaria 403 no botão que está bem ali na barra de filtros — achado da revisão, corrigido antes do commit.
- **Manual:** `docs/manual/financeiro/producao.md` (novo) + linha na tabela de `financeiro/README.md` (saiu de "ainda a documentar") + entrada em `search-index.json`. Cobre os dois modos de leitura, o aviso de R$ 0, conta obrigatória, exportação e a aba de lotes.

**Verificação:** `tsc`, `eslint`, 99 testes do financeiro, `smoke:sync-pagamento` 19/19, JSON do manifesto validado (`JSON.parse`), e conferência independente contra o banco de dev: `dadosFolhaExport` sem filtro bate com o `total` de `listarFolha` (13), `status=pago` bate com `count` direto (8), `status=todos` bate com a soma geral (14), `truncado` é `false` com as 15 linhas do dev.
- **Não executado:** a rota em si e o botão no navegador (exigem sessão) — só a função de dados foi exercitada, contra o banco real. Falta confirmar no navegador: o download baixa de fato (CSV abre certo no Excel, acentos ok — o BOM já é testado em outras rotas), e que o filtro na URL no momento do clique é o que sai no arquivo.

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
3. **Existe lançamento histórico sem conta?** — **respondido em produção, 2026-09-11: não.** `levantar-folha-projetistas.ts` rodado no servidor (script copiado manualmente — o branch ainda não foi mergeado/deployado): 15 pagamentos (12 pendentes, 3 pagos), 1 pendente zerado (o mesmo de sempre, já coberto pela F0a — `cmsro7g71036v74nu4g4r3wxq`, Carlos Augusto, Estrutural, projeto 260018), **0** lançamentos confirmados de R$ 0,00, **0** pagamentos efetivados sem conta bancária. N3 (conta obrigatória) segue valendo só daqui para frente — não havia nada pra corrigir retroativamente.

---

## 9. Backlog pós-smoke (achados do dono em tela, 2026-09-11)

Smoke em navegador rodando (worktree, dados de dev) — nada quebrado, mas 5 pedidos novos e 1 item do checklist sem dado pra testar.

### Checklist

- **10-3 "Gerar lote com pagamento pendente fora de lote"** — não testável: dev não tem pendente fora de lote em nenhum mês além de 04/2026 (já lotado). Não é bug — falta dado, não falta código. Pendente até alguém liberar uma entrega nova sem gerar lote antes.

### Achados novos (D26–D30)

| # | Pedido | Risco / decisão |
| --- | --- | --- |
| **D26** | **Anexar comprovante ao pagar.** | **Menor do que parece — já existe.** `LancamentoAnexo` + `adicionarAnexoLancamento`/`removerAnexoLancamento` (`lancamentos/actions.ts`) já fazem isso, usados hoje em `lancamento-detalhe-dialog.tsx`. Todo "Pagar" cria/confirma um `Lancamento`, e o D24 já linka pra ele ("ver lançamento"). Falta só encurtar o caminho: upload dentro do próprio `EfetivarPagamentoDialog`, ou abrir o detalhe do lançamento direto após pagar. Sem schema novo. |
| **D27** | **Pagamento confirmado não permite edição — trocar por edição com justificativa auditável.** | **Decidido (2026-09-11, N6):** bloquear edição se o `Lancamento` vinculado já estiver **conciliado** (`Lancamento.conciliado`/OFX) — nesse caso a única saída continua sendo cancelar. Não conciliado, a edição é permitida com justificativa obrigatória (vira o `detalhe` do `AuditLog`, via `capturarAntes`). **Escopo de campos fechado (2026-09-11, dono): todos os campos** — valor, conta, forma e data, não só valor+observação. |
| **D28** | **Nome do arquivo exportado deve incluir os filtros aplicados.** | Baixo risco, sem decisão pendente — troca `Producao.xlsx` fixo por algo como `Producao-pago-2026-09.xlsx` (status + período, quando houver). Evita o Windows empilhar `Producao (1).xlsx`, `(2)`… de exports diferentes (foi exatamente o que apareceu no histórico de downloads do teste). |
| **D29** | **Lote muito opaco — listar os pagamentos dentro dele.** | Baixo risco. Mesmo padrão já construído em F3 (`Collapsible` por grupo): expandir a linha do lote mostra as linhas de `PagamentoProjetista` que o compõem, igual ao grupo por projetista já faz. Sem action nova, só query (`listarFolhasProjetista` já sabe contar; falta trazer as linhas). |
| **D30** | **Permitir excluir ou editar um lote.** | **Decidido (2026-09-11, N7):** excluir um lote solta todos os pagamentos dele (`folhaId: null`, pagos inclusive) — mesmo padrão que cancelar um pagamento já usa. Nenhum `Lancamento` é tocado; só o agrupamento em lote desfaz. "Editar" (mover pagamento entre lotes) segue sem decisão fechada — não bloqueia a F12, que pode nascer só com "excluir". |

### Fases do backlog pós-smoke (F8–F12 entregues)

| Fase | Resolve | Modelo sugerido | Por quê |
| --- | --- | --- | --- |
| **F8** — Comprovante no fluxo de pagar | D26 | Sonnet 5 | Reusa capability existente, sem schema novo — encanamento de UI. |
| **F9** — Nome do arquivo de export | D28 | Sonnet 5 (ou junto com F8) | Trivial, uma função pura + teste. |
| **F10** — Lote expandido (lista os pagamentos) | D29 | Sonnet 5 | Reusa `Collapsible` da F3, query aditiva. |
| **F11** — Editar pagamento confirmado c/ justificativa ✅ | D27, N6 | **Opus 5** | Entregue 2026-09-11 — ver bloco abaixo. |
| **F12** — Excluir lote ✅ | D30, N7 | **Opus 5** | Entregue 2026-09-11 — ver bloco abaixo. "Editar" lote segue fora do escopo. |

**✅ F8 entregue 2026-09-11 (Sonnet 5) — como ficou:**
- **Rota própria, não reuso** — `POST /api/financeiro/folha-projetistas/comprovante` (upload) e as actions `anexarComprovantePagamento`/(sem `remover`, ver abaixo) em `folha/actions.ts`, cópia deliberada de `api/financeiro/lancamentos/anexo` + `adicionarAnexoLancamento`, não reuso: aquelas gate em `financeiro:gerir`, estas em `folha_pj` (opção **A** da comparação de prós/contras — não alargar o gate geral de anexos pra quem só tem acesso à Produção).
- **Guarda de escopo além da permissão:** `anexarComprovantePagamento` recusa se o `Lancamento` alvo não tiver `pagamentoProjetistaId` — fecha o furo de um usuário só-`folha_pj` anexar em QUALQUER lançamento adivinhando o id. Conferido contra o banco de dev nos dois sentidos (lançamento de produção passa, lançamento comum é recusado).
- **Fluxo em 2 passos, só no Pagar individual:** `PagarDialog` abre `AnexarComprovanteDialog` depois de `pagarProjetista` confirmar, com "Concluir sem anexar" sempre disponível — comprovante é o ideal, nunca bloqueio. Lote/selecionados/grupo (Pagar tudo) ficam de fora de propósito: geram vários lançamentos por clique, e "anexar um arquivo aqui" não mapeia limpo pra N lançamentos; quem precisa anexar num desses caminhos usa o de sempre (abrir o lançamento em Lançamentos).
- **Visibilidade adicionada na revisão:** `CelulaPagamento` (D24) passou a mostrar "N anexo(s)" ou "sem anexo" (aviso) em toda linha paga — sem isso, `removerComprovantePagamento` ficava sem chamador e "o ideal é todo pagamento ter comprovante" era inverificável em tela. `comLancamentos` ganhou `_count.anexos` no mesmo `findMany`, sem N+1.
- **Removido do corte:** `removerComprovantePagamento` foi escrito e depois retirado — sem UI que o chamasse, ficaria morto. Gerenciar/remover comprovante já anexado segue pelo caminho de sempre (Lançamentos, `financeiro:gerir`).
- **Consequência aceita, não corrigida agora:** um usuário só-`folha_pj` vê o aviso "sem anexo" nos 3 pagos de produção anteriores a esta entrega e não tem, nesta tela, como resolver isso — só quem tem `financeiro:gerir` consegue anexar retroativamente pelo Lançamento. Fica registrado como possível F13, não implementado.
- Arquivo escrito em disco ANTES da linha em `LancamentoAnexo` existir — falha depois (guarda de escopo, sessão) deixa o arquivo órfão, sem limpeza automática. Mesmo buraco que já existe em `api/financeiro/lancamentos/anexo`, documentado no comentário da rota, não uma regressão nova.

**✅ F9 e F10 entregues 2026-09-11 (Sonnet 5) — como ficou:**
- **F9:** `nomeArquivoExport(filtros, formato)` em `folha/service.ts` (pura, 6 testes) — monta `Producao-<status>-de-<data>-ate-<data>-busca-<slug>.<formato>`, cada segmento só entra se o filtro correspondente estiver ativo. `dadosFolhaExport` passou a devolver `filtros` junto (o chamador não precisa reler a URL). Sem filtro, o nome continua `Producao.xlsx` — igual a antes.
- **F10:** `listarPagamentosDoLote(folhaId)` (`folha-lote/queries.ts`) reusa o MESMO `INCLUDE_PAGAMENTO`/`comLancamentos` de `listarFolha` (agora exportados) — o lote expandido tem a mesma rastreabilidade (D24) da lista principal, não uma versão mais pobre. Carregado sob demanda por lote ao expandir (mesmo raciocínio do D12: não carregar toda linha filha só pra montar a lista de lotes).
  - **Leitura fora de `defineAction`:** `pagamentosDoLote` em `folha-lote/actions.ts` segue o padrão já usado em `buscarEmpresaParaVincularAction` (comercial) — é busca, não mutação, `AuditLog` a cada expandir/recolher poluiria a trilha. Ainda exige sessão + `folha_pj`.
  - **Achado na revisão, corrigido antes do commit:** a 1ª versão devolvia `[]` quando a permissão faltava — igual ao precedente do comercial, mas ERRADO aqui: um lote "3/3 pagos" mostraria "este lote não tem pagamentos", uma afirmação falsa sobre dado financeiro que ninguém leria como erro (hoje inalcançável, a página já exige `folha_pj`, e é por isso que precisava ficar certo agora). Corrigido pra `{ok:true,itens}|{ok:false}`, com mensagem própria de "sem permissão" no painel.
  - **2ª correção:** o painel só buscava na 1ª expansão e guardava em estado local — pagar o lote (ou corrigir um valor) com o painel aberto deixava a tabela expandida desatualizada mesmo depois do `router.refresh()`. Trocado pra recarregar a CADA abertura (3 linhas por lote, custo desprezível).
  - `podeLancamento` plumbado em `page.tsx` (branch da aba Lotes), mesmo gate (`financeiro:ver`) do modo Pagamentos.

**Verificação (F8, F9, F10):** `tsc`, `eslint`, 105 testes do financeiro, `smoke:sync-pagamento` 19/19 em cada rodada, e conferência independente contra o banco de dev — F10: `listarPagamentosDoLote` do lote 04/2026 batendo com `count` direto e com `qtd` do resumo (3/3); F8: `qtdAnexos` de `comLancamentos` batendo com `lancamentoAnexo.count` direto nos 2 sentidos (com e sem `pagamentoProjetistaId`). Checklist de smoke em navegador (artefato publicado) atualizado com os 3 itens novos (07, 10, 11).

**✅ F11 entregue 2026-09-11 (Opus 5) — como ficou:**
- **Porta nova, não afrouxamento:** `corrigirPagamentoEfetivado` (`folha/actions.ts`) é uma action separada. `editarPagamentoProjetista` continua só para pendente e `erroTransicao` não mudou (os 6 testes dela seguem iguais). Gate `folha_pj`, mesmo formato do F8: só alcança lançamentos que nascem de um `PagamentoProjetista`.
- **Todos os campos (N6 refinado):** valor, conta, forma, data e observação, com **justificativa obrigatória** (10 a 500 caracteres). A justificativa entra no `AuditLog` pelo input (`detalhe.novo`); o `capturarAntes` grava **os dois lados** do estado anterior (pagamento + lançamento), porque conta e data moram no lançamento e "qual era a conta antes" é justamente o que a justificativa responde. Como não existe relação Prisma entre as tabelas, o lançamento é achado pela mesma precedência de `comLancamentos`/`confirmarDespesaProjetista` (`lancamentoId`, depois `pagamentoProjetistaId`).
- **Regra pura `erroCorrecaoEfetivado`** (`folha/service.ts`, 7 testes): só `pago`; lançamento existente e `confirmado`; **não conciliado** (tem `TransacaoBancaria` ligada, o mesmo teste da tela de Lançamentos); sem baixa parcial (`valorEfetivo`). A tela usa a mesma regra: um conciliado mostra o texto "conciliado — não editável" no lugar do botão; os outros bloqueios (raros) mantêm o botão e o clique diz o motivo.
- **Guardas repetidas na escrita:** pagamento reservado com `where status:"pago"`; lançamento atualizado com `updateMany where {status:"confirmado", valorEfetivo:null, transacao:{is:null}, excluidoEm:null}`. Se achar 0 linhas, a transação inteira volta. Isso estreita a janela contra um `conciliarComLancamento` concorrente, mas não é um lock entre as duas telas (está escrito no comentário).
- **O que muda no caixa:** `valor`, `contaId`, `formaId` e `dataConfirmacao` do lançamento. `data` (competência) fica igual, como `confirmarDespesaProjetista` também preserva. Mantém as cargas do §5: `recalcularTotalFolha` e `sincronizarValorDisciplina` ("pool = soma dos vivos" inclui os pagos). Revalida `folha-projetistas`, `lancamentos` e `fluxo-caixa`.
- **Dialog (`corrigir-pagamento-dialog.tsx`)** parte do que está gravado, nunca de campos vazios. A data é lida com getters UTC (é meia-noite UTC gravada); os locais dariam o dia anterior em BRT. A conta/forma atual entra na lista **mesmo se tiver sido desativada**, marcada "(inativa)": sem isso, corrigir só o valor obrigaria a mover o dinheiro para outra conta. Ligado nos dois modos (por pagamento e por projetista). Rótulo "Corrigir pagamento", diferente do "Corrigir valor" do pendente zerado.
- **Fora do corte, de propósito:** o painel do lote expandido (F10) segue só leitura, sem ação de corrigir. Nenhuma notificação vai para o projetista quando o valor de um pago muda.

**Verificação (F11):** `tsc`, `eslint`, 112 testes do financeiro (+7), `smoke:sync-pagamento` 19/19 e conferência contra o banco de dev numa transação desfeita: o `conciliado` de `comLancamentos` bate com a `TransacaoBancaria` lida direto (2/2 pagos com lançamento); a guarda da escrita acha 1 linha no lançamento livre e **0** depois de conciliá-lo dentro da mesma transação; o rollback não deixou resíduo. O dev não tem nenhum lançamento de produção conciliado, então o "conciliado — não editável" da tela só aparece no navegador depois de conciliar um pelo extrato.

**✅ F12 entregue 2026-09-11 (Opus 5) — como ficou:**
- **`excluirFolhaProjetista`** (`folha-lote/actions.ts`, `folha_pj`): solta **todos** os pagamentos do lote (`folhaId: null`, pagos inclusive, N7) e apaga o `FolhaProjetista`, numa transação só. **Nenhum pagamento e nenhum `Lancamento` é apagado ou alterado.** O `updateMany` explícito não depende só do `onDelete: SetNull` do schema: a intenção fica no código e a contagem volta para a tela.
- **Auditoria:** o lote some da tabela, então o `capturarAntes` grava o que ele era (ano, mês, status, total, datas) **e a lista de pagamentos que estavam dentro** (id, status, valor). É o único registro que permite remontar o agrupamento. A tela de Auditoria só mostra o nome da entidade, sem buscar pelo `entidadeId`, então os registros antigos que apontam para o lote excluído continuam aparecendo normalmente.
- **Quem mais lê `FolhaProjetista`:** ninguém fora do próprio módulo (`rh/folha` é a folha CLT, outro model; `uploads/pagamento.ts` só solta e recalcula o lote). Nenhum relatório perde histórico.
- **UI:** lixeira na linha do lote, fora do `CollapsibleTrigger` e sempre renderizada (colunas não se mexem). A confirmação é montada com `qtd`/`pagos` do `FolhaLoteItem`, sem query nova, e diz a consequência que não é óbvia: **pagos soltos não voltam a um lote se o mês for gerado de novo**, porque `gerarFolhaDoMes` só recolhe pendentes (carga do §5, que continua intacta).
- **"Editar" lote** (mover pagamento entre lotes) segue fora, como previsto na N7.
- Rótulos novos em `auditoria/labels.ts` para as 3 ações criadas no backlog (`anexar-comprovante-pagamento`, `corrigir-pagamento-efetivado`, `excluir-folha-lote`). A mensagem de `erroTransicao("editar","pago")` passou a apontar para "Corrigir pagamento", já que "não pode mais ser alterado" ficou falso com a F11.

**Verificação (F12):** `tsc`, `eslint`, 121 testes (financeiro + auditoria), `smoke:sync-pagamento` 19/19 e conferência contra o banco de dev numa transação desfeita, com o lote 04/2026: 3/3 pagamentos soltos, os pagamentos **continuam existindo** (sem cascata), status inalterados, contagem total de pagamentos e lançamentos igual, os 2 lançamentos vinculados idênticos campo a campo, lote apagado, e rollback sem resíduo. Limite: o lote do dev só tem pendentes, então o caso "pago dentro do lote" não foi exercitado com dado real (é o mesmo `updateMany`, que só mexe no `folhaId`).

---

## 8. Branch

A branch atual (`feat/guias-de-uso`) tem ~25 arquivos modificados não commitados de trabalho
**não relacionado** (certidões, soft delete, `nav-badge`, `metadata-publica`). Escrever este plano
aqui é inofensivo; **implementar em cima desta pilha não é.**

Pela regra do repo (memória `workflow-branch-dev`): refatoração grande sai em
**`feat/folha-projetistas` a partir de `dev`**, com a pilha atual resolvida antes.
