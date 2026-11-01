# EAP — Fase C (seleção, lote, colar tarefas, copiar bloco, árvore de predecessoras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe seleciona várias linhas da EAP e recua, avança, move e exclui de uma vez; cola várias tarefas de uma vez; copia um agrupamento inteiro para outro lugar; e escolhe predecessoras numa árvore.

**Architecture:** Regras de árvore em lote são puras (`planejamento/arvore-lote.ts`); o I/O reaproveita as funções por linha de `arvore-service.ts`, que passam a aceitar um `db` e rodam todas numa única transação (tudo ou nada, um reagendamento, um passo de desfazer). A seleção múltipla vive no `PlanoGantt` e sobe para o `EapWorkspace`, que roteia o menu, a barra de estrutura (setas) e os atalhos para as ações em lote. Colar tarefas e copiar bloco criam linhas novas com `reservarIdsParaLinhas`, a disciplina do agrupamento (A1) e um passo de desfazer. A árvore de predecessoras é uma janela que edita o mesmo conjunto de vínculos da célula de texto.

**Tech Stack:** Next 15 / React 19, Prisma 7 (`@/generated/prisma/client`), vitest (node), smokes via `tsx --tsconfig tsconfig.server.json`.

**Spec:** [docs/superpowers/specs/2026-10-22-eap-apontamentos-equipe-design.md](../specs/2026-10-22-eap-apontamentos-equipe-design.md) — Fase C (C1–C5).

## Global Constraints

- Código em inglês; texto de tela, mensagem e commit em pt-BR.
- Toda mutação por `defineAction`; o handler vai embrulhado em `comPassoDaAction` (Fase B) — **um passo de desfazer por lote**. Erro de negócio = `ActionError` com a frase pronta (a MESMA do menu desabilitado, ADR-0002 regra 5).
- Ação em lote = **UMA chamada ao servidor** e UM `aposMudarEap` (não repetir a action por linha no navegador). Tudo ou nada: uma transação; a mensagem de erro diz qual linha barrou.
- Teto de 200 linhas por lote (selecionar, colar, copiar).
- Sem `Promise.all` dentro de `$transaction`. `await confirm()` antes de `startTransition`.
- Arquivos puros (`arvore-lote.ts`, `colar-tarefas.ts`) não importam Prisma, `server-only` nem Next.
- Linha nova (colar, copiar) nasce com a disciplina do agrupamento de destino (`disciplinaParaLinhaNova`) e a fase só se a disciplina a tem (`faseDaLinhaNova`); cada uma ganha `idCorporativo` por `reservarIdsParaLinhas`; `herdarResponsaveisNoProjeto` nas linhas novas.
- Plano travado (`planoTravado`) recusa tudo com `MOTIVO_PLANO_TRAVADO`; a tela desabilita com a mesma frase.
- Nunca escrever `contextmenu` à mão (só `ui/context-menu.tsx`); toda ação do menu também está no `...`.
- Terminar com `docs/PROTOCOLO_AUDITORIA_FINAL.md` (nível 3–4), tela conferida pelo agente na porta 3001 (390×844: `scrollWidth` 390).

## Review Focus

1. **Selecionar um agrupamento e as filhas dele e recuar** → só o agrupamento recua (as filhas vão com ele); selecionar três irmãs seguidas e recuar → as três viram irmãs sob a linha acima delas (não aninhadas umas nas outras). (Task 1 e 2.)
2. **Mover para cima com a primeira irmã selecionada** → recusa o lote inteiro com a frase de `MOTIVO_PRIMEIRA_DO_NIVEL`, sem mexer em nada. (Task 1 e 2.)
3. **Colar tarefas com linha em branco, duração inválida, 0 (marco) e mais de 200 linhas** → linha em branco ignorada; duração inválida aponta a linha; `0`/`marco` vira marco; acima do teto recusa. (Task 4.)
4. **Copiar um bloco com vínculo para fora do bloco e restrição de data** → só vínculos internos são copiados (remapeados), restrição/pessoas/% não; colar sob agrupamento de outra disciplina → disciplina do destino. (Task 5.)
5. **Predecessora que fecharia um ciclo, a própria linha e um descendente** → aparecem desabilitadas na árvore com o motivo. (Task 6.)

---

### Task 1: Regras puras da árvore em lote

**Files:**
- Create: `src/modules/planejamento/arvore-lote.ts`
- Test: `src/modules/planejamento/arvore-lote.test.ts`

**Interfaces:**
- Consumes: `NoArvore`, `MOTIVO_*`, `planoDeRecuo`/`planoDeAvanco`/`planoDeMoverNoNivel` de `arvore-eap.ts` (já existentes).
- Produces:
  ```ts
  export const MAX_LINHAS_LOTE = 200;
  export function ordemDeDocumento(nos: readonly NoArvore[]): string[];                  // DFS, irmãs por (ordem, id)
  export function raizesDaSelecao(nos: readonly NoArvore[], ids: readonly string[]): string[];  // sem quem tem ancestral selecionado, em ordem de documento
  export type RecuoEmLote = { ok: true; movimentos: { id: string; novoPaiId: string }[] } | { ok: false; motivo: string; linhaId?: string };
  export function planoDeRecuoEmLote(nos: readonly NoArvore[], ids: readonly string[]): RecuoEmLote;
  export function motivoParaAvancarEmLote(nos: readonly NoArvore[], ids: readonly string[]): { motivo: string; linhaId: string } | null;
  export function motivoParaMoverEmLote(nos: readonly NoArvore[], ids: readonly string[], direcao: -1 | 1): { motivo: string; linhaId: string } | null;
  ```

- [ ] **Step 1: Write the failing tests** (`arvore-lote.test.ts`), com uma fábrica `no(id, parentId, ordem, tipoEap="atv")`:
  - `ordemDeDocumento`: árvore `A(ordem 0) › A1, A2 ; B` devolve `["A","A1","A2","B"]`; irmãs por `ordem`, empate pelo `id`.
  - `raizesDaSelecao`: selecionar `["A","A1","B"]` → `["A","B"]`; ordena em ordem de documento mesmo se a seleção vier embaralhada; id inexistente é ignorado.
  - `planoDeRecuoEmLote`: irmãs `P › X, Y, Z, W`; selecionar `Y,Z` → `[{Y→X},{Z→X}]` (as duas sob X, nunca Z sob Y); selecionar `X` (primeira) → `{ ok:false, motivo: MOTIVO_SEM_IRMA_ACIMA, linhaId:"X" }`; selecionar `X,Y` → recusa por X; irmã acima é marco → `MOTIVO_IRMA_E_MARCO`; selecionar mãe + filha → só a mãe entra.
  - `motivoParaAvancarEmLote`: todas na raiz → `MOTIVO_NIVEL_MAIS_ALTO` com a primeira raiz; todas com pai → `null`.
  - `motivoParaMoverEmLote`: `-1` com a primeira irmã entre as raízes selecionadas → `MOTIVO_PRIMEIRA_DO_NIVEL`; `+1` com a última → `MOTIVO_ULTIMA_DO_NIVEL`; blocos em pais diferentes são conferidos cada um no seu nível; meio da lista → `null`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/arvore-lote.test.ts` → FAIL (módulo ausente).
- [ ] **Step 3: Implement** `arvore-lote.ts`. Recuo em lote: cada raiz da seleção ganha como novo pai a **irmã imediatamente acima que não está selecionada** (varrendo para trás), na árvore ORIGINAL; `movimentos` em ordem de documento. Cabeçalho de comentário explicando por que não é a aplicação sequencial de `planoDeRecuo` (aninharia).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(planejamento): regras puras da árvore da EAP em lote`.

---

### Task 2: Serviços em lote (I/O) + smoke

**Files:**
- Modify: `src/modules/planejamento/arvore-service.ts` (as funções por linha aceitam `db`)
- Create: `src/modules/planejamento/arvore-lote-service.ts`
- Create: `scripts/smoke-eap-lote.ts`
- Modify: `package.json` (`smoke:eap-lote`), `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  // arvore-service.ts: assinaturas existentes ganham `db` opcional (padrão = prisma); com `db` de transação não abrem $transaction aninhada
  export async function recuarLinha(id: string, db?: Db): Promise<{ projetoId: string; paiVirouAgrupamentoComGente: boolean }>;
  export async function avancarLinha(id: string, db?: Db): Promise<{ projetoId: string }>;
  export async function moverLinhaNoNivel(id: string, direcao: -1 | 1, db?: Db): Promise<{ projetoId: string }>;
  // arvore-lote-service.ts ("server-only")
  export async function recuarEmLote(ids: readonly string[]): Promise<{ projetoId: string; linhas: number; paisComGente: number }>;
  export async function avancarEmLote(ids: readonly string[]): Promise<{ projetoId: string; linhas: number }>;
  export async function moverEmLote(ids: readonly string[], direcao: -1 | 1): Promise<{ projetoId: string; linhas: number }>;
  export async function excluirEmLote(ids: readonly string[]): Promise<{ projetoId: string; linhas: number; excluidas: number }>;
  ```
  Todas: exigem que os ids sejam de UM projeto (senão `ActionError("As linhas escolhidas são de projetos diferentes.")`), ids vazios/inexistentes → `ActionError("Escolha ao menos uma linha.")`, mais de `MAX_LINHAS_LOTE` → frase; trabalham sobre `raizesDaSelecao`; uma `$transaction` (timeout 60 s). Mensagem de recusa: `"<motivo>"` com o nome da linha na frente quando o motivo vem de uma linha (`"Modelagem: Esta tarefa já é a primeira do nível."`). `excluirEmLote` apaga as raízes (filhas por cascade) e devolve quantas linhas saíram no total.

- [ ] **Step 1: Write the failing smoke** `smoke-eap-lote.ts` (projeto de teste em rascunho, árvore `P › X,Y,Z,W` mais `Q › Q1`), checks:
  - recuar `Y,Z` → ambas filhas de X (irmãs, ordem Y antes de Z); `parentId` de W continua P;
  - recuar `X` (primeira) → recusa com a frase e **nada** mudou (todo ou nada);
  - recuar `Y` e a filha dela selecionadas juntas → só Y entra, a filha continua sob Y;
  - avançar `Y,Z` (agora sob X) → voltam a ser filhas de P, nessa ordem, e W continua depois delas;
  - avançar linhas de topo → recusa `MOTIVO_NIVEL_MAIS_ALTO`;
  - mover `Y,Z` para cima em bloco (X,Y,Z,W → Y,Z,X,W); mover com a primeira selecionada → recusa sem mexer;
  - excluir `Q` e `W` → somem com `Q1`; ids de projetos diferentes → recusa.
  Cada check de "nada mudou" compara `parentId`/`ordem` de todas as linhas antes e depois.
- [ ] **Step 2: Run to verify fail** — `npm run smoke:eap-lote` (módulo ausente).
- [ ] **Step 3: Implement.** Em `arvore-service.ts`: `carregar(id, db)`; `proximaOrdem(db, …)` já recebe db; `recuarLinha/avancarLinha/moverLinhaNoNivel/gravarMovimento` usam `db.$transaction` só quando `db === prisma`. `recuarEmLote` usa `planoDeRecuoEmLote` e grava `parentId` + `ordem: proximaOrdem` crescente na ordem de documento (mesmo critério de `recuarLinha`), contando `paisComGente` como `recuarLinha` faz; `avancarEmLote` confere `motivoParaAvancarEmLote`, depois chama `avancarLinha(id, tx)` para cada raiz em ordem de documento; `moverEmLote` confere `motivoParaMoverEmLote`, depois `moverLinhaNoNivel(id, direcao, tx)` em ordem de documento (para `-1`) ou inversa (para `+1`).
- [ ] **Step 4: Run to verify pass** — smoke ok; `npx vitest run src/modules/planejamento` verde; tsc e eslint limpos.
- [ ] **Step 5: Commit** `feat(planejamento): recuar, avançar, mover e excluir várias linhas da EAP de uma vez`.

---

### Task 3: Ações em lote

**Files:**
- Modify: `src/modules/planejamento/actions.ts`

**Interfaces:**
- Consumes: Task 2, `comPassoDaAction`, `projetoDaLinha`.
- Produces (todas `...plan`, `entidade: "EapTarefa"`, schema `{ ids: string[] (1..MAX_LINHAS_LOTE, mensagem pt-BR) }`, `entidadeId` = primeiro id, `exigirPlanoEditavel` do projeto antes de gravar, `aposMudarEap`, `revProjeto`):
  ```ts
  export const recuarEapTarefas;        // → { linhas: number; paisComGente: number }
  export const avancarEapTarefas;       // → { linhas: number }
  export const moverEapTarefasNoNivel;  // schema + { direcao: -1 | 1 } → { linhas: number }
  export const excluirEapTarefas;       // → { linhas: number; excluidas: number }
  ```
  Rótulos do desfazer: `Recuar 3 linhas`, `Avançar 3 linhas`, `Mover 3 linhas`, `Excluir 3 linhas` (`1 linha` no singular).

- [ ] **Step 1:** implementar as quatro actions embrulhadas em `comPassoDaAction` (`projetoDe: (i) => projetoDaLinha(i.ids[0])`). `excluirEapTarefas` passa por `exigirPlanoEditavel`.
- [ ] **Step 2: Verify** — `npx tsc --noEmit -p tsconfig.json`, `npx eslint src/modules/planejamento`, `npm test` (guardas) verdes. O comportamento já está coberto pelo smoke da Task 2; o desfazer de lote entra no smoke da Task 3: **estender `smoke-desfazer-eap.ts`** com um lote (`recuarEmLote` dentro de `comPasso`) e conferir que **um** `desfazerUltimoPasso` devolve o lote inteiro.
- [ ] **Step 3: Commit.**

---

### Task 4: Seleção múltipla, menu em lote e barra de estrutura (C1 + C2)

**Files:**
- Create: `src/modules/planejamento/acoes-lote-eap.ts` (descritor puro) + `acoes-lote-eap.test.ts`
- Create: `src/components/planejamento/barra-estrutura.tsx`
- Modify: `src/components/planejamento/plano-gantt.tsx` (seleção múltipla), `src/components/planejamento/eap-workspace.tsx` (roteamento), `src/modules/planejamento/acoes-eap.ts` (ids de copiar/colar entram na Task 6)

**Interfaces:**
- Consumes: Task 1 (motivos), Task 3 (actions).
- Produces:
  ```ts
  // acoes-lote-eap.ts (puro; AcaoItem de components/ui/acoes)
  export const ACAO_COPIAR = "copiar-linhas"; export const ACAO_COLAR = "colar-linhas";   // ids usados na Task 6
  export function itensDeEstruturaEap(ctx: {
    nos: readonly NoArvore[]; selecionadas: readonly string[]; planoTravado: boolean; podeColar: boolean;
  }): AcaoItem[];   // ids: ACAO_AVANCAR, ACAO_RECUAR, ACAO_MOVER_CIMA, ACAO_MOVER_BAIXO, ACAO_EXCLUIR (+ copiar/colar quando a Task 6 entrar); desabilitados com o motivo de arvore-lote ("Escolha ao menos uma linha." sem seleção; MOTIVO_PLANO_TRAVADO com plano travado)
  // PlanoGantt: nova prop
  onSelecaoChange?: (ids: string[]) => void;      // ordem de documento
  // EapWorkspace: estado `selecionadas: string[]`
  ```

- [ ] **Step 1: Write the failing tests** (`acoes-lote-eap.test.ts`): sem seleção → todos desabilitados com "Escolha ao menos uma linha."; plano travado → todos com `MOTIVO_PLANO_TRAVADO`; recuar com a primeira irmã selecionada → motivo `MOTIVO_SEM_IRMA_ACIMA`; mover para cima com a primeira → `MOTIVO_PRIMEIRA_DO_NIVEL`; seleção válida → todos habilitados; excluir leva `confirmar` com a contagem (`Excluir 3 linhas?`, e quantas subtarefas saem junto).
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/acoes-lote-eap.test.ts`.
- [ ] **Step 3: Implement** o descritor e:
  - `PlanoGantt`: estado `selecao` (ids) e `ancora`. Clique simples = `{id}` (âncora = id); **Ctrl/⌘+clique** alterna; **Shift+clique** seleciona o intervalo na ordem visível (`linhas`), ignorando linhas escondidas por recolhimento/filtro. A linha selecionada mostra o destaque existente. Chama `onSelecaoChange(idsEmOrdemDeDocumento)` a cada mudança. Abrir o menu de contexto numa linha **fora** da seleção a troca pela linha clicada; **dentro**, mantém (ADR-0002 regra 3). Esc limpa a seleção quando o foco está numa linha.
  - Menu de contexto, `...` e atalhos Alt+Shift+setas/Delete passam a agir sobre a seleção quando ela tem 2+ linhas (a linha clicada se for 1).
  - `EapWorkspace.aoAcao`: com 2+ linhas selecionadas, `recuar/avançar/mover/excluir` chamam as actions em lote (um `confirm` com a contagem para excluir, **antes** de gravar); com 1 linha segue as actions atuais. Aviso `paisComGente` como hoje. Depois: `router.refresh()`.
  - `BarraEstrutura` (acima da tabela, só para `podeGerir`): botões de ícone ← (avançar) → (recuar) ↑ ↓ (mover), e o contador "N selecionadas" com "limpar"; usa `itensDeEstruturaEap`; o motivo do desabilitado vai no `title` do `<span>` invólucro (botão desabilitado não recebe o mouse). Atalhos no tooltip. Quebra de linha no celular.
- [ ] **Step 4: Verify** — vitest do descritor verde; lint e tsc limpos; **tela** (Task 7): selecionar 3 irmãs com Shift, recuar pela seta, desfazer com Ctrl+Z (um passo).
- [ ] **Step 5: Commit.**

---

### Task 5: Colar várias tarefas de uma vez (C3)

**Files:**
- Create: `src/modules/planejamento/colar-tarefas.ts` (puro) + `colar-tarefas.test.ts`
- Create: `src/modules/planejamento/colar-tarefas-service.ts`
- Create: `src/components/planejamento/colar-tarefas-dialog.tsx`
- Modify: `src/modules/planejamento/actions.ts`, `src/components/planejamento/eap-workspace.tsx`, `scripts/smoke-eap-lote.ts`

**Interfaces:**
- Produces:
  ```ts
  // colar-tarefas.ts
  export type TarefaColada = { nome: string; marco: boolean; duracaoDias: number | null };   // null = padrão 1 dia útil
  export type LeituraColada = { ok: true; tarefas: TarefaColada[] } | { ok: false; erro: string; linha: number };
  export function lerTarefasColadas(texto: string): LeituraColada;   // uma por linha; "Nome<TAB>duração"; duração como lerDuracao ("5", "5d", "0"/"marco" = marco); linhas em branco ignoradas; nome vazio ou duração inválida aponta a linha (1-based); > MAX_LINHAS_LOTE recusa
  // colar-tarefas-service.ts ("server-only")
  export async function criarTarefasEmLote(p: { projetoId: string; depoisDeId: string | null; tarefas: readonly TarefaColada[] }): Promise<{ ids: string[] }>;
  // actions.ts
  export const criarEapTarefasEmLote;   // schema { projetoId, depoisDeId: string | null, texto: string } → { criadas: number }; lê o texto no SERVIDOR com lerTarefasColadas
  ```
  Posição: abaixo de `depoisDeId`, **no mesmo nível** (mesmo pai); `null` = fim da raiz. As `ordem` das irmãs seguintes são empurradas pelo tamanho do lote. Disciplina/fase: `disciplinaParaLinhaNova(pai)` + `faseDaLinhaNova`; `idCorporativo` por `reservarIdsParaLinhas`; `herdarResponsaveisNoProjeto`; datas provisórias como `criarEapTarefa`; marco = `tipoEap "mrc"`, duração 0.

- [ ] **Step 1: Write the failing tests** (`colar-tarefas.test.ts`): `"A\nB"` → duas tarefas, duração `null`; `"Projeto\t5\nVistoria\t0\nEntrega\tmarco"` → `5`, marco, marco; linhas em branco e espaços ignorados; `"A\t5d"` e `"A\t2,5"` (meio dia aceito como `lerDuracao`); `"\t5"` → erro na linha 1 ("Informe o nome da tarefa."); `"A\tx"` → erro com o número da linha; 201 linhas → erro de teto; texto vazio → erro "Cole ao menos uma tarefa.".
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/colar-tarefas.test.ts`.
- [ ] **Step 3: Implement** o parser (reusa `lerDuracao` de `gantt-linhas.ts`), o serviço e a action (embrulhada com `comPassoDaAction`, rótulo `Colar N tarefas`, `exigirPlanoEditavel`, `aposMudarEap`). Diálogo "Novas tarefas": textarea (placeholder com o formato), prévia com a contagem e as linhas que o parser entendeu (nome, duração/marco), botão "Criar N tarefas" desabilitado com texto inválido (a mensagem do parser aparece sob o campo). Botão "Novas tarefas" na barra, ao lado de "Nova tarefa"; usa a primeira linha da seleção como `depoisDeId` (sem seleção, fim da lista).
- [ ] **Step 4: Extend o smoke:** colar `"Vistoria\t0\nLevantamento\t3\n\nRelatório"` abaixo de uma linha sob agrupamento com disciplina → 3 linhas, no mesmo pai, na ordem certa logo abaixo da referência, com a disciplina do agrupamento, marco com duração 0, `idCorporativo` preenchido e únicos; as irmãs seguintes continuam depois delas.
- [ ] **Step 5: Run** — vitest, smoke, tsc, eslint verdes. **Commit.**

---

### Task 6: Copiar um bloco e colar (C4)

**Files:**
- Create: `src/modules/planejamento/colar-bloco-service.ts`
- Modify: `src/modules/planejamento/acoes-lote-eap.ts` (itens Copiar/Colar), `src/modules/planejamento/actions.ts`, `src/components/planejamento/eap-workspace.tsx`, `scripts/smoke-eap-lote.ts`

**Interfaces:**
- Consumes: `clonarEap` (`projetos/duplicar-eap.ts`, puro), `disciplinaParaLinhaNova`, `faseDaLinhaNova`, `reservarIdsParaLinhas`.
- Produces:
  ```ts
  // colar-bloco-service.ts ("server-only")
  export async function colarBloco(p: { projetoId: string; origemIds: readonly string[]; depoisDeId: string | null }): Promise<{ criadas: number }>;
  // actions.ts
  export const colarEapBloco;   // schema { projetoId, origemIds: string[] (1..MAX_LINHAS_LOTE), depoisDeId: string | null } → { criadas: number }
  ```
  Regras: a origem são as `raizesDaSelecao` e **tudo dentro delas**; o limite de 200 conta as linhas copiadas. Copia estrutura, nomes, duração, marco, tipo, prioridade, classificadores, a marca "Externo" e **vínculos internos ao bloco** (remapeados); **não** copia pessoas, horas, %, datas reais, restrições, bloqueio nem vínculos com linhas de fora. O bloco entra abaixo de `depoisDeId` (no nível dele; `null` = fim da raiz), na ordem de documento da origem. Disciplina: todas as linhas copiadas tomam a disciplina do agrupamento de destino (mapa único origem→destino; sem disciplina no destino, ficam sem); fase só se a disciplina de destino a tem. Cada linha ganha `idCorporativo` novo. Origem em outro projeto → recusa.

- [ ] **Step 1: Write the failing smoke** (estende `smoke-eap-lote.ts`): bloco `B › B1, B2` (B2 depende de B1; B1 depende de uma linha de fora F; B2 com restrição de data, pessoa e 50%) copiado e colado abaixo de uma linha sob agrupamento de outra disciplina → 3 linhas novas com ids novos e `idCorporativo` novos; `parentId` das novas aponta para as novas; B2'→B1' existe, B1'→F **não**; restrição, pessoa e % não foram; disciplina = a do destino; as originais intactas; colar sem origem/origem de outro projeto → recusa; passos de desfazer: um passo e desfazer apaga as 3.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** o serviço (carrega as linhas e vínculos da origem, monta `LinhaEapOrigem[]` com `deTerceiro: ehEtapaDeTerceiro(atribuicoes)`, chama `clonarEap`, sobrescreve `parentId` das raízes clonadas com o pai de destino e `ordem` das raízes com a sequência abaixo da referência, empurrando as irmãs seguintes), a action (embrulhada, rótulo `Colar N linhas`, `exigirPlanoEditavel`, `aposMudarEap`) e a UI: itens **Copiar** (`ACAO_COPIAR`, só guarda os ids da seleção no estado do workspace e avisa com toast "N linhas copiadas") e **Colar abaixo** (`ACAO_COLAR`, desabilitado sem nada copiado: "Copie linhas antes de colar.") no menu, no `...` e na barra; atalhos Ctrl+C / Ctrl+V com foco numa linha (não em campo de texto).
- [ ] **Step 4: Run** — smoke, tsc, eslint, `npm test` verdes. **Commit.**

---

### Task 7: Escolher predecessoras numa árvore (C5)

**Files:**
- Create: `src/modules/planejamento/arvore-predecessoras.ts` (puro) + `arvore-predecessoras.test.ts`
- Create: `src/components/planejamento/predecessoras-dialog.tsx`
- Modify: `src/components/planejamento/plano-gantt.tsx` (botão ao lado da célula Predecessoras), `src/components/planejamento/eap-workspace.tsx`

**Interfaces:**
- Consumes: `criaCiclo` (`ciclo-dependencias.ts`), `Vinculo`, `formatarPredecessoras`.
- Produces:
  ```ts
  // arvore-predecessoras.ts
  export type OpcaoPredecessora = { id: string; codigo: string; nome: string; nivel: number; desabilitada: string | null };
  export function opcoesDePredecessora(p: {
    linhas: readonly { id: string; parentId: string | null; codigo: string; nome: string; tipoEap: string; ordem: number }[];
    dependencias: readonly { tarefaId: string; predecessoraId: string }[];
    linhaId: string;
  }): OpcaoPredecessora[];   // em ordem de documento; desabilitada = frase do motivo
  export function aplicarEscolha(atuais: readonly Vinculo[], escolhidas: ReadonlySet<string>): Vinculo[];   // mantém tipo/atraso dos que já existiam; novos entram FS sem atraso
  ```
  Motivos (`desabilitada`): a própria linha → `"Uma tarefa não pode ser predecessora de si mesma."`; uma subtarefa dela → `"Uma subtarefa não pode ser predecessora da tarefa-mãe."`; fecharia ciclo → `"Criaria um ciclo: esta tarefa já depende (direta ou indiretamente) da linha que você está editando."`.

- [ ] **Step 1: Write the failing tests:** `opcoesDePredecessora` — própria linha, descendente e linha que já depende dela (ciclo, inclusive indireto) saem desabilitadas com a frase certa; demais habilitadas; ordem de documento e `nivel` (0 = raiz); `aplicarEscolha` — mantém `tipo`/`lagDias` dos já existentes, ignora ids desmarcados, novo entra `{ tipo: "fs", lagDias: 0 }`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/arvore-predecessoras.test.ts`.
- [ ] **Step 3: Implement** a regra pura e a janela: título "Predecessoras de «código nome»", campo de busca (código ou nome), árvore recolhível com checkbox por linha (código + nome, recuo por nível), desabilitadas com o motivo no `title`, botão **Aplicar** que chama `onEditarPredecessoras(t, aplicarEscolha(...))` (o mesmo caminho da célula, um reagendamento) e fecha, **Cancelar**. Um botão pequeno (ícone de lista) ao lado da célula Predecessoras abre a janela; a célula de texto continua igual. Só para quem tem `onEditarPredecessoras` (plano editável).
- [ ] **Step 4: Run** — vitest, tsc, eslint verdes; tela (Task 8). **Commit.**

---

### Task 8: Manual, tela e auditoria final

**Files:** `docs/manual/projetos/planejamento.md`, `docs/manual/novidades.md`, `prints-auditoria/2026-10-22_<hhmm>_eap-fase-c-lote/`.

- [ ] **Step 1:** manual (seção "Várias linhas de uma vez": selecionar, setas, excluir, copiar/colar bloco, "Novas tarefas", árvore de predecessoras; atalhos) e novidades.
- [ ] **Step 2: Tela** (dev na 3001, usuário `claude.admin@dev.senahub`, 260208 em revisão, restaurar depois): Shift+clique em 3 irmãs → seta → recuam como irmãs; Ctrl+Z desfaz o lote inteiro; mover em bloco; copiar um agrupamento e colar; "Novas tarefas" com 3 linhas; árvore de predecessoras com uma opção desabilitada; 390×844 sem rolagem horizontal; menu de contexto sobre a seleção. Prints + `LEIAME.md`.
- [ ] **Step 3:** `npm test`, `npm run lint`, `tsc -p tsconfig.server.json`, `npm run build` (sem `next dev`), smokes `eap-lote`, `desfazer-eap`, `disciplina-eap`, `eap-integracao`, `recursos-eap`. Revisores: `action-guardian`, `client-boundary-auditor`, `ui-state-linter`, `a11y-auditor` e um revisor Opus do branch.
- [ ] **Step 4: Commit** do manual; relatório em pt-BR.
