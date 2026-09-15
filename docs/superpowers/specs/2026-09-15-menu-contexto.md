# Menu de contexto (botão direito) — onda 1

**Data:** 2026-09-15 · **Status:** planejado, nada implementado · **Pedido:** "nada usa o botão
direito e dá muita cara de site — botão direito com utilidade nos menus e funções traria uma
experiência mais premium"

Decidido em sessão de grilling (Q1–Q22). Regras transversais em
[ADR-0002](../../adr/0002-menu-de-contexto.md) — ler antes de qualquer fase.

---

## 0. Modelo por fase (ler primeiro)

Uma troca de modelo (A → B, entre F2 e F3). O checklist de release (§2, fim) não é fase e roda
em qualquer modelo. **Ao iniciar uma fase, a primeira linha da
resposta é o modelo esperado. Se o modelo ativo for outro: PARAR e esperar `/model`.**

| Bloco | Fases | Modelo | Por quê |
|---|---|---|---|
| A | F1 + F2 | **Opus** | Formato novo (descritor + hook) que as ondas seguintes vão copiar; espelho cliente↔servidor de permissão; refatorar dois componentes compartilhados (5 e 3 consumidores) sem mudar a API pública, e subir os 5 diálogos por linha do `MenuDocumento` para a tabela. Erro aqui se replica. |
| B | F3 | **Sonnet** | Só adição, com formato já provado: um teste-guarda novo, `coachmarks.ts`, manual e roteiro. A dica temporária e os `data-tour` já ficam prontos no bloco A, então Sonnet não reabre board, diretório nem tabela. |

Branch: `feat/menu-contexto` saindo de `dev`. Um commit por fase (F2 tem dois). `npm run lint` + `npm test`
verdes antes de cada commit.

**Pré-requisito de 2d e de F3:** em 2026-09-15 há trabalho não commitado do histórico do
documento — `painel-documento-detalhe.tsx`, `historico-documento.tsx`, `modules/uploads/*`, rotas
de download/DWG **e** `docs/manual/novidades.md`, `docs/manual/projetos/projetos.md`,
`docs/manual/search-index.json` — e os últimos commits de `dev` mexem em `tabela-documentos`.
Colide com a tabela de documentos (2d) e com o passo de manual (3d), não com board nem
`diretorio-view`: F1 e 2a–2c podem começar já; **2d e F3 só depois que esse trabalho estiver
commitado em `dev`** — rebase e reconferir as linhas citadas.

---

## 1. Decisões (resumo do grilling)

**Objetivo (Q1):** percepção de app desktop + menos cliques. Capacidade nova (multi-seleção,
lote) só na onda 3, se a onda 1 provar uso.

**Regras (ADR-0002 + grilling):**
1. Nativo nunca suprimido em superfície de leitura; supressão só dentro de `ContextMenu.Trigger`,
   com reposição do que o nativo dava (Q4, Q7, Q15).
2. Paridade: toda ação do menu existe também em `...`/toolbar/botão — base-ui não abre por
   teclado (Q8, Q10).
3. **Na linha fica status + ação primária do perfil; o resto vai para o menu** (Q14).
4. Item `variant: "destructive"` sempre passa por `useConfirm`, com `confirm()` **antes** do
   `start()` (Q11 — ver `confirm-dialog.test.ts`).
5. Não permitido por **perfil** → item escondido. Não permitido por **estado da entidade**
   (dono, bloqueio, finalizado) → item desabilitado com motivo (Q12).

**Formato (Q2, Q6, Q13):** por entidade, duas camadas:
- `itensDe<Entidade>(entidade, ctx): AcaoItem[]` — **puro**, client-safe, testado. Decide quais
  itens aparecem, habilitados ou não, e o motivo.
- `useAcoes<Entidade>(ctx)` — casca fina: amarra `onSelect` a actions/diálogos/confirm e devolve
  `{ itens(entidade), portal }`. Chamado **uma vez por lista**; o `portal` (diálogos) é
  renderizado uma vez; cada linha/card tem seu próprio `Trigger`.
- O mesmo array alimenta o menu de contexto **e** o `...` da entidade.

**Fatos verificados que sustentam o plano:**
- `@base-ui/react/context-menu` já instalado (v1.5). `index.parts.d.ts` re-exporta as peças do
  `Menu` — `DropdownMenuContent/Item/Sub/Separator` funcionam dentro do `ContextMenu.Root` sem
  alteração. `MenuLinkItem` existe (item que é `<a>` de verdade).
- `ContextMenuTrigger` renderiza `<div>` (usar `render` para `<li>`), chama `preventDefault` +
  `stopPropagation` no `contextmenu` (trigger aninhado não dispara o pai), faz toque longo de
  500 ms cancelado por movimento > 10 px, e aplica `WebkitTouchCallout: 'none'` **inline e
  incondicional** (inofensivo no desktop; não tentar sobrescrever).
- dnd-kit ignora botão direito (`PointerSensor`: `button !== 0` sai). No board, `listeners` ficam
  só na alça `GripVertical`; `activationConstraint: { distance: 6 }`.
- Hoje `src/` não tem nenhum `onContextMenu`/`"contextmenu"`. O viewer BIM gira com botão direito
  via `CameraControls.mouseButtons`, não pelo evento.
- `vitest` roda em ambiente node, sem jsdom: só a camada pura é testável por unidade (Q17).

---

## 2. Fases

### F1 — Primitiva + regras + board de tarefas · **Opus** (bloco A)

**1a. Primitiva** — `src/components/ui/context-menu.tsx` (~40 linhas): `ContextMenu` (Root),
`ContextMenuTrigger`, `ContextMenuContent` (reusa as classes de `DropdownMenuContent`, trocando
`w-(--anchor-width)` por `w-auto` — a âncora é um ponto de largura 0). Não duplicar Item/Sub:
reusar os de `dropdown-menu.tsx`. `data-popup-open` do Trigger destaca a linha com menu aberto.
`select-none` no Trigger **só** em `(pointer: coarse)`.

**1b. Tipo `AcaoItem`** — `src/components/ui/acoes.ts` (client-safe) + renderizador único
`<AcoesMenuItens itens onSelect />`, usado pelo menu de contexto **e** pelo `...`. Ponto de
partida (formato final é decisão de F1, não contrato):

```ts
type AcaoItem =
  | { tipo: "acao"; id: string; rotulo: string; icone?: LucideIcon; variant?: "default" | "destructive";
      desabilitado?: string /* motivo */; confirmar?: { titulo: string; descricao?: string } }
  | { tipo: "link"; id: string; rotulo: string; icone?: LucideIcon; href: string; novaAba?: boolean }
  | { tipo: "sub"; id: string; rotulo: string; icone?: LucideIcon; itens: AcaoItem[] }
  | { tipo: "separador" };
```

**Risco a testar em 1b:** item de menu que abre diálogo (ou `confirm`) disputa foco — ao fechar,
o menu devolve o foco ao Trigger enquanto o diálogo tenta prender o foco. `useConfirm` já é global
(`ConfirmProvider`), então sobrevive ao menu desmontar; mas validar no navegador que o diálogo abre
focado e que Esc/fechar volta o foco à linha. Se brigar, abrir o diálogo no `onOpenChangeComplete`
do menu, não no `onClick` do item.

**1c. Regras** — `src/modules/tarefas/regras.ts` (puro, sem `server-only`) + `regras.test.ts`:
- `podeMoverTarefa(t, meId, meRole)` — hoje privada em `tarefas-board.tsx:61`. Espelha
  `escopoTarefa` (`queries.ts:15`) usado por `exigirAcessoTarefa` (`actions.ts:60`).
- `podeEditarTarefa(t, meId, meRole)` — hoje inline em `tarefa-dialog.tsx:124`. Espelha
  `exigirCriadorOuGlobal` (`actions.ts:133`), que guarda `editarTarefa` e `arquivarTarefa`.
- Board e diálogo passam a importar daqui. Comentário em cada função apontando o gate do servidor.

**1d. Descritor** — `src/modules/tarefas/acoes.ts` + `acoes.test.ts`: `itensDeTarefa(t, ctx)`
com `ctx = { meId, meRole, colunas }`:

| Item | Regra |
|---|---|
| Abrir | sempre |
| Mover para ▸ (colunas, exceto a atual) | escondido se `!podeMover`; coluna `concluido` desabilitada com "Tarefa bloqueada: conclua as dependências primeiro." se `t.bloqueada` |
| Copiar título | sempre (reposição do "Copiar" nativo) |
| — separador — | |
| Arquivar (destructive, confirmar) | desabilitado com "Só quem criou a tarefa (ou admin/supervisor) pode editá-la." se `!podeEditar` |

Texto do motivo = mesma frase do `ActionError` do servidor.

**1e. Board** — `src/components/tarefas/`:
- `useAcoesTarefa({ meId, meRole, colunas, onAbrir })` — `moverTarefa`, `arquivarTarefa`,
  `navigator.clipboard.writeText` + toast.
- **`...` sempre renderizado e focável** — esconder só com opacidade
  (`opacity-0 group-hover:opacity-100 focus-within:opacity-100 focus-visible:opacity-100`), nunca
  `hidden`/`display:none`: botão escondido assim não recebe Tab, o foco nunca entra, o
  `focus-within` nunca dispara e a regra 2 morre em silêncio. Vale para o card, a célula `...` da
  lista e a linha do diretório.
- Card: `ContextMenuTrigger` envolvendo o card; `...` como
  **irmão** do `<button>` principal — o corpo do card já é um `<button>` (`tarefas-board.tsx:500`),
  não aninhar botão em botão.
- Área da coluna (`ColunaView`): Trigger próprio com "Nova tarefa em *X*" (`TarefaDialog` já
  aceita `valoresIniciais` → `{ statusId }`) e "Limpar filtros" (só se `temFiltro`). O Trigger
  do card, aninhado, bloqueia o da coluna (`stopPropagation`).
  Paridade (regra 2): "Nova tarefa em *X*" não ganha botão próprio — o botão "Nova tarefa" do
  topo (`tarefas-board.tsx:177`) + o `Select` de status do diálogo (`tarefa-dialog.tsx:383`)
  chegam ao mesmo resultado pelo teclado. O menu só economiza um passo; não é caminho exclusivo.
- **Toque × arrastar:** o `onTouchStart` do Trigger faz `stopPropagation`. O `PointerSensor` do
  dnd-kit ouve `pointerdown`, que é outro evento, então não deve ser afetado — mas testar no modo
  touch. Se o arrastar pela alça quebrar, deixar a alça fora do Trigger (Trigger só no corpo do card).
- **Primeira verificação de 1e:** `render={<TableRow />}` — `TableRow` (`table.tsx:55`) é função
  sem `forwardRef` que espalha `...props` no `<tr>`. No React 19 o ref vem como prop e deve chegar,
  mas confirmar que o `triggerRef` do base-ui aponta para o `<tr>`: se ficar `null`, o menu abre
  mas o fechamento por `mouseup` fora falha em silêncio. Vale também para 2d.
- Vista lista (`ListaView`, `tarefas-board.tsx:382`): mesmo menu na `TableRow` — segundo
  consumidor do descritor. A linha hoje não tem célula de ação (`onClick` abre a tarefa): ganha
  **célula `...`** (regra 2), com `stopPropagation` no clique para não abrir a tarefa junto.
- **Dica temporária (Q16c, Q18)** — criar aqui, completa, `src/components/ui/dica-menu-contexto.tsx`
  (~30 linhas): faixa discreta "Dica: clique com o botão direito em um arquivo ou tarefa para ver
  as ações. No celular, toque e segure." Some quando hoje passar de `DICA_MENU_CONTEXTO_ATE`
  (constante no próprio arquivo, com **data provisória bem no futuro — `2027-12-31`** — para a
  dica aparecer durante o teste manual; o checklist de release troca pela data real; comparação por dia-calendário via
  `lib/data.ts`, que é puro) ou quando o usuário clicar "Entendi" (`localStorage`, leitura e
  escrita em `try/catch`). Montar no topo do board. Nasce em F1 porque board, diretório e tabela
  precisam importá-la, e F3 não reabre esses arquivos.
- **Já colocar aqui** o `data-tour="menu-contexto"` no primeiro card do quadro.

**Auditoria no fim de F1** (agentes só leitura sobre o diff de F1): `a11y-auditor`,
`design-system-guardian`, `client-boundary-auditor`, `ui-state-linter`. A **correção** é que
depende do modelo — fica aqui, no Opus, antes do commit.

**Pronto quando:** testes de `regras` e `acoes` verdes; auditoria tratada; board, diálogo e lista usando
`regras.ts`; arrastar continua funcionando; commit
`feat(tarefas): menu de contexto no quadro e na lista de tarefas` — com a primitiva, o
`AcaoItem` e a dica temporária no mesmo commit, citados no corpo da mensagem.

---

### F2 — Arquivos: diretório + tabela de documentos · **Opus** (bloco A, sem troca)

**2a. Separar os dois componentes compartilhados sem mudar a API pública.**
`AcoesValidacaoArquivo` tem 5 consumidores (`aprovacoes-view`, `diretorio-view`,
`arquivos-explorer`, `disciplina-card`, `pdf-viewer`); `VisualizarDwgButton` tem 3
(`diretorio-view`, `arquivos-explorer`, `badge-extensao`). **Fora `diretorio-view`, nenhum desses
arquivos muda** — os botões são recompostos a partir das peças extraídas, com as mesmas props.
**`AcoesValidacaoArquivo` continua renderizando `DialogAjusteArquivo` por dentro, e
`VisualizarDwgButton` continua renderizando `StatusConversaoDwg` + `DialogDwgViewer` por dentro.**
Extrair = mover para arquivo/função própria e reimportar, nunca tirar do botão; senão "Solicitar
ajuste" deixa de abrir em `aprovacoes-view`, `disciplina-card`, `pdf-viewer` e
`arquivos-explorer`. Só `diretorio-view` (e a tabela, em 2d) usa as peças soltas.
- `acoes-validacao-arquivo.tsx` → extrair `BotaoValidacaoArquivo` (props `uploadId`, `validado`,
  `onSolicitarAjuste`: os botões validar/desfazer/ajuste de hoje), `DialogAjusteArquivo`
  (controlado: `open`, `onOpenChange`, `uploadId`, `nomeArquivo`) e `useValidacaoArquivo()`
  (`validar`, `reverter`, `solicitar`, `pending`). `AcoesValidacaoArquivo` passa a ser
  `BotaoValidacaoArquivo + DialogAjusteArquivo` — os 4 consumidores intocados renderizam
  exatamente o mesmo.
- `visualizar-dwg-button.tsx` → extrair `useStatusConversaoDwg(desenhoId, nomeArquivo)` (polling
  + `retentar`), `StatusConversaoDwg` (ícone convertendo/erro — **status, fica na linha**) e
  `DialogDwgViewer` (controlado; mantém o `next/dynamic` do `DwgViewer` fora do bundle inicial).
- Verificar os consumidores com build e um clique em cada tela (`/aprovacoes`, card da
  disciplina, explorer do projeto, preview PDF).

**2b. Descritor** — `src/modules/arquivos/acoes.ts` + teste: `itensDeArquivo(a, ctx)` com
`ctx = { podeValidar, finalizado, statusDwg }`:

| Item | Regra |
|---|---|
| Abrir em nova aba | só PDF: `tipo: "link"` para `downloadUrl?disposition=inline` com `novaAba` (substitui o ícone Eye; um item só, não dois) |
| Baixar | sempre: `tipo: "link"` para `downloadUrl` (substitui o "Copiar endereço"/"Salvar link" do nativo no ícone Download) |
| Copiar link | sempre: clipboard com a URL absoluta de `downloadUrl` (PDF: a versão `?disposition=inline`) |
| Ver desenho | só `.dwg`; desabilitado com "Convertendo desenho…" / "Erro na conversão" conforme `statusDwg` |
| Copiar nome | sempre |
| — separador — | |
| Validar / Desfazer validação | escondido se `!podeValidar`; desabilitado com "Entrega finalizada" se `finalizado`; alterna por `a.aprovado` |
| Solicitar ajuste | como Validar; só quando `!a.aprovado` |

**2c. Linha** (`diretorio-view.tsx`, `DisciplinaNode`): `useAcoesArquivo` chamado **uma vez por
`DisciplinaNode`**; `portal` com `DialogAjusteArquivo` + `DialogDwgViewer`. Cada `<li>` vira
`ContextMenuTrigger render={<li />}`.
- **Fica na linha:** Download · Validar/desfazer (quando `mostrarAcoes`) · `StatusConversaoDwg` ·
  `...` (novo).
- **`diretorio-view` deixa de usar `AcoesValidacaoArquivo` inteiro** (ele traz o diálogo de ajuste
  por dentro, e o diálogo montaria duas vezes). Na linha usa `BotaoValidacaoArquivo` com
  `onSolicitarAjuste` apontando para o `portal` do `useAcoesArquivo`, que tem o **único**
  `DialogAjusteArquivo`. Mesma marcação das outras telas, sem botão feito à mão. Os outros 4 consumidores continuam usando `AcoesValidacaoArquivo` sem mudança.
- **Sai da linha (vai para o menu):** ícone Abrir PDF, ícone Ver DWG, ícone Solicitar ajuste.
- Status DWG: a linha consulta uma vez e passa o status ao descritor — nunca dois pollings por
  arquivo.
- Nós de projeto/disciplina do diretório não ganham menu na onda 1.

**2d. Tabela de documentos do projeto** (`/projetos/[id]/arquivos`). Está na onda 1 porque é a
segunda metade do item 1 aprovado na Q3 ("`diretorio-view.tsx` + `menu-documento.tsx`"); as
"tabelas com `...`" da onda 2 são as de outros módulos. `menu-documento.tsx`
(372 linhas, **1 consumidor**: `tabela-documentos.tsx:331`). Já tem `...` com Visualizar,
Comparar revisões, Baixar, Histórico, Validar/Desfazer/Solicitar ajuste, Renomear, Excluir
(via `EscopoExclusaoDialog`, que já é a confirmação — atende a regra 4) e Solicitar exclusão.
Hoje monta **5 diálogos por linha**.
- Extrair `itensDeDocumento(linha, ctx)` para `src/modules/arquivos/acoes.ts` (mesmo arquivo de
  2b), com `ctx = { projetoId, podeValidar, podeExcluir, podeSolicitarExclusao }`. Os gates de
  perfil que já escondem itens continuam escondendo; somar "Abrir em nova aba", "Copiar link" e
  "Copiar nome" (reposição).
- Subir estado e diálogos de `MenuDocumento` para `useAcoesDocumento`, chamado uma vez em
  `TabelaDocumentos` (Q13). Como o único consumidor é a tabela, a refatoração fica contida.
  `MenuDocumento` vira o `...` fino que renderiza `AcoesMenuItens`.
- `<TableRow>` (`tabela-documentos.tsx:221`) vira `ContextMenuTrigger render={<TableRow />}`.
- **A tabela já tem multi-seleção** (`selecao`, `BarraSelecaoDocumentos`). Na onda 1 o botão
  direito age **só na linha clicada** e não mexe na seleção. "Botão direito numa linha
  selecionada age sobre todas as selecionadas" é comportamento de explorador e fica para a
  onda 3.
- Reaproveitar o `DialogAjusteArquivo` de 2a no lugar do diálogo de ajuste duplicado aqui.
- **Já colocar em 2c** o `data-tour="menu-contexto"` na primeira linha do diretório, e **em 2c e 2d**
  montar a `DicaMenuContexto` (criada em F1) no topo do diretório e da tabela (a tabela não tem
  coachmark — ver 3c). F3 (Sonnet) não reabre `diretorio-view` nem `tabela-documentos`.

**Auditoria no fim de F2:** os mesmos 4 agentes sobre o diff de F2 (+ `upload-storage-auditor`,
porque mexe em links de download); correções aqui, no Opus.

**Pronto quando:** consumidores intactos verificados; testes dos descritores verdes; auditoria
tratada. **Dois
commits** no mesmo bloco (sem troca de modelo), para reverter um sem levar o outro:
1. 2a–2c → `feat(arquivos): menu de contexto nas linhas do diretório`
2. 2d → `feat(arquivos): menu de contexto na tabela de documentos`

---

### F3 — Guarda, coachmarks e documentação · **Sonnet** (bloco B)

> **PARAR antes de começar: pedir `/model` → Sonnet.**

**3a. Teste-guarda** — `src/components/ui/context-menu.test.ts`, no formato de
`confirm-dialog.test.ts`, mas varrendo **`.ts` e `.tsx`** (excluindo `generated` e **todo
`*.test.ts`** — senão o teste acha as próprias strings e falha; essa exclusão é do varredor, não
entra na lista de exceções da ADR). Falha se
`onContextMenu` ou a string `contextmenu` entre aspas aparecer fora de
`src/components/ui/context-menu.tsx`. Lista de exceções **vazia**, com comentário: "incluir
arquivo aqui exige emendar a ADR-0002". Incluir teste do próprio detector (acha o ruim, ignora o
bom).

**3b. Dica temporária** — já criada e montada em F1/F2. Nada a fazer aqui além de conferir no
roteiro (3f).

**3c. Coachmarks (Q16a)** — `src/components/onboarding/coachmarks.ts`: guias novos para
`/tarefas` e `/arquivos` (hoje só existem guias para `/`,
`/preferencias` e `/configuracoes/avisos` — nenhum casa por prefixo com estas rotas). **A tabela de documentos fica sem coachmark:** `guiaParaRota`
(`coachmarks.ts:56`) casa rota literal por prefixo e não aceita segmento dinâmico — um guia em
`/projetos` apareceria em todas as telas de projeto. Lá, só a dica (3b).
Um passo por guia, apontando para o primeiro card/linha
(`data-tour="menu-contexto"`, já colocado em F1/F2). Passo sem alvo é pulado — tela vazia não quebra.

**3d. Manual** — seção de uso em `docs/manual/projetos/tarefas.md` e em
`docs/manual/projetos/projetos.md` (aba Arquivos + diretório `/arquivos`, que hoje não tem página
própria): botão direito, toque longo, `...`, o que cada item faz; entrada em `docs/manual/novidades.md`;
atualizar `docs/manual/search-index.json` (palavras-chave: botão direito, menu de contexto,
clique direito, toque longo, atalho).

**3e. Revisão** — só dos arquivos novos de F3 (teste-guarda, `coachmarks.ts`). Achado em arquivo
de F1/F2 **não** é corrigido aqui: anotar e voltar ao Opus.

**3f. Roteiro de teste manual** (dono, no navegador; `npm run dev` basta):
- [ ] Botão direito no card → menu no ponto do cursor; Esc fecha; clique fora fecha.
- [ ] Botão direito na área vazia da coluna → "Nova tarefa em X" abre o diálogo com a coluna certa.
- [ ] Botão direito num card abre **só** o menu do card, nunca também o da coluna (triggers aninhados).
- [ ] Botão direito em cabeçalho, filtros e texto da página → **menu nativo** aparece.
- [ ] Arrastar card pela alça continua funcionando, **com mouse e no modo touch do DevTools**; botão direito na alça não inicia arrasto.
- [ ] Mover para coluna concluída com tarefa bloqueada → item desabilitado com motivo.
- [ ] Arquivar pelo menu → confirmação → toast; cancelar não arquiva.
- [ ] Usuário que não criou a tarefa: Arquivar aparece desabilitado com motivo.
- [ ] `...` do card e da linha alcançável com Tab e abre com Enter.
- [ ] Linha de arquivo: Abrir em nova aba abre aba; Copiar link/nome copia; Ver desenho abre viewer.
- [ ] Solicitar ajuste pelo menu → diálogo → notificação enviada.
- [ ] `/aprovacoes`, card da disciplina, explorer do projeto e preview PDF: validar/ajuste/DWG iguais a antes.
- [ ] Tabela de documentos do projeto: botão direito na linha mostra os mesmos itens do `...`; Excluir abre o diálogo de escopo; Renomear e Histórico funcionam.
- [ ] Tabela de documentos com linhas selecionadas: botão direito age só na linha clicada e a seleção não muda.
- [ ] DevTools em modo touch: toque longo abre o menu; rolar a lista não abre.
- [ ] Toque longo no card abre o menu **sem** abrir também o diálogo da tarefa ao soltar o dedo (o corpo do card é um `<button>`; o trigger do base-ui não faz `preventDefault` nesse caminho). Se abrir, bloquear o `click` que segue um toque longo.
- [ ] Viewer BIM (`/projetos/[id]/coordenacao`): botão direito ainda gira a câmera.
- [ ] Dica aparece; "Entendi" some e não volta ao recarregar.
- [ ] Tema claro e escuro.

**Pronto quando:** guarda verde, revisões tratadas, roteiro OK; commit
`feat(ui): guarda do menu de contexto, coachmarks e documentação`.

---

### Checklist de release (não é fase; qualquer modelo)

Na publicação que leva o branch para produção — pode ser dias depois de F3:
- Trocar `DICA_MENU_CONTEXTO_ATE` (`2027-12-31` provisório) pela data do deploy + 7 dias.
- Abrir issue em `SenaProjetos/senahub` com label `ready-for-agent`: "Remover dica temporária do
  menu de contexto após <data>" — apagar `dica-menu-contexto.tsx`, seus usos e a constante.
  **Não** remover coachmarks nem manual. Ação externa: confirmar com o dono antes de criar.

---

## 3. Fora da onda 1

| Item | Motivo |
|---|---|
| Chat | `chat-view.tsx` com 3816 linhas; refatorar antes |
| Viewers BIM e DWG | botão direito já tem dono (câmera) |
| Nós de projeto/disciplina no diretório | onda 2 |
| Multi-seleção nova e menu agindo sobre várias linhas selecionadas (a tabela de documentos já tem seleção; o menu não usa na onda 1) | onda 3 (Q1) |

## 4. Backlog da onda 2 (novo grilling antes de começar — Q22)

- Tabelas com `...` hoje: `acessos-tabela`, `clientes-view`, `campanhas-view`, `parceiros-view`,
  `disciplinas-catalogo-view`, `usuarios-view`, `orcamento-arvore-view`,
  `contas-pagar-receber-view`, `lancamentos-view`, `projeto-acoes-menu`.
- Outras linhas do `arquivos-explorer.tsx` (2848 linhas) que usam `VisualizarDwgButton` e
  `AcoesValidacaoArquivo` fora da tabela de documentos.
- `projeto` como entidade do descritor, com o command palette como terceiro consumidor.
- Canvas do Estúdio (`documentos/editor/elemento-view.tsx`) — primeira exceção da guarda; exige
  emendar a ADR-0002.
- Cabeçalho de coluna dos boards.
- Outros boards: `disciplinas-kanban`, `funil-board`, `negociacao-board`, `prospeccao-board`.
- Adotar `DialogAjusteArquivo` / `DialogDwgViewer` nos demais consumidores, se fizer sentido.
- **EAP do planejamento** (`planejamento/eap-workspace.tsx`, 382 linhas): inserir tarefa acima /
  abaixo / filha, recuar/avançar nível, marcar marco. É onde quem vem do MS Project mais espera
  botão direito.
- **Agenda** (`agenda/agenda-view.tsx`): botão direito no dia/horário → "Novo evento aqui"; no
  evento → editar, duplicar, excluir.
- **Aprovações e pedidos de exclusão** (`arquivos/aprovacoes-view.tsx`, `pedidos-exclusao-view.tsx`):
  aprovar / recusar na linha — reaproveita `itensDeArquivo`.
- **Mesa de planejamento financeiro** (`financeiro/planejamento/planejamento-mesa-view.tsx`).
- **Disciplinas operacionais** (`projetos/disciplinas-operacionais.tsx`).
