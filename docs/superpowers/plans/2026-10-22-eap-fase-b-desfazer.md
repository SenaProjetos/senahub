# EAP — Fase B (desfazer, Ctrl+Z) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ctrl+Z e um botão "Desfazer" na EAP restauram a última mudança do plano feita pela pessoa, com as linhas, vínculos e pessoas que ela levou junto.

**Architecture:** Cada mutação do plano roda dentro de um invólucro (`comPasso`) que lê uma **foto do plano inteiro do projeto** antes, executa, lê a impressão digital do plano depois e grava um passo (`EapPassoDesfazer`: foto de antes + impressão de depois). Desfazer compara a impressão do plano de hoje com a do passo (se outra pessoa mexeu, recusa e descarta o passo), calcula por diff (puro) o que recriar/apagar/atualizar com os mesmos ids e aplica numa transação. A foto é do plano inteiro, e não só das linhas tocadas, porque cascade, reordenação e herança de responsável tornam o conjunto "afetado" difícil de prever.

**Tech Stack:** Next 15, Prisma 7 (`@/generated/prisma/client`), vitest (node), smoke via `tsx --tsconfig tsconfig.server.json`.

**Spec:** [docs/superpowers/specs/2026-10-22-eap-apontamentos-equipe-design.md](../specs/2026-10-22-eap-apontamentos-equipe-design.md) — Fase B.

## Global Constraints

- Código em inglês; texto de tela, mensagem e commit em pt-BR.
- Toda mutação por `defineAction`; erro de negócio = `ActionError` com frase pronta.
- Sem `Promise.all` dentro de `$transaction`. `await confirm()` antes de `startTransition`.
- Arquivos puros (`desfazer/estado.ts`) não importam Prisma, `server-only` nem Next.
- Pilha: **últimas 20 ações por pessoa e por projeto**, no servidor. Só com o plano editável (`planoTravado` falso); aprovado sem revisão = `MOTIVO_PLANO_TRAVADO`.
- A pilha do projeto é apagada ao **aprovar** o cronograma e ao **fechar a revisão com nova linha de base**.
- Restaurar recria com os **mesmos ids e o mesmo `idCorporativo`**; nunca reserva id novo.
- Fora do desfazer: % concluído, datas reais, status, bloqueio, Data de Status, aprovar/replanejar, aplicar modelo, gerar EAP das disciplinas, apagar a EAP inteira. Refazer (Ctrl+Y) **não entra** nesta fase (desejável, não obrigatório no spec).
- Campos do PLANO (impressão digital e atualização): `parentId, ordem, nome, disciplinaId, etapaId, tipoEap, duracaoDias, tipoAtividadeId, sistemaId, localizacaoId, origemId, prioridade, restricaoTipo, restricaoData`. Linha recriada leva a linha inteira da foto.
- Stage arquivos específicos; conferir `git show --stat`. Migração: o histórico de dev tem drift — usar `db push` + migration escrita à mão + `migrate resolve` (memória `migracao-drift-reset`).
- Fechar com `docs/PROTOCOLO_AUDITORIA_FINAL.md` (nível 3–4), tela conferida pelo agente na porta 3001.

## Review Focus

1. **Excluir uma mãe com filhas, vínculos e pessoas e desfazer** → tudo volta com os mesmos ids; `idCorporativo` igual. (Task 3 smoke.)
2. **Outra pessoa editou depois do passo** → desfazer recusa com frase e descarta o passo; nada é sobrescrito. (Task 3 smoke.)
3. **Parcela de contrato ligada ao marco apagado** (`ContratoParcelaEntrega.marcoId` vira nulo) → desfazer religa. (Task 3 smoke.)
4. **Plano aprovado sem revisão** → desfazer recusa com `MOTIVO_PLANO_TRAVADO` e a pilha de antes da aprovação não existe mais. (Task 3 e 4 smoke.)
5. **Ação que não muda nada** (ex.: salvar igual) → não cria passo. (Task 1 teste puro e Task 3 smoke.)

---

### Task 1: Estado do plano, impressão digital e plano de restauração (puro)

**Files:**
- Create: `src/modules/planejamento/desfazer/estado.ts`
- Test: `src/modules/planejamento/desfazer/estado.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CAMPOS_DO_PLANO = ["parentId","ordem","nome","disciplinaId","etapaId","tipoEap","duracaoDias","tipoAtividadeId","sistemaId","localizacaoId","origemId","prioridade","restricaoTipo","restricaoData"] as const;
  export type LinhaFoto = { id: string } & Record<string, unknown>;          // linha inteira (JSON-safe)
  export type DependenciaFoto = { id: string; tarefaId: string; predecessoraId: string; tipo: string; lagDias: string };
  export type AtribuicaoFoto = { id: string; tarefaId: string; userId: string | null; papel: string; horasPrevistas: string; principal: boolean };
  export type EstadoPlano = {
    inicioProjeto: string | null;                       // YYYY-MM-DD
    linhas: LinhaFoto[]; dependencias: DependenciaFoto[]; atribuicoes: AtribuicaoFoto[];
    parcelas: { id: string; marcoId: string | null }[];            // ContratoParcelaEntrega com marcoId ∈ linhas
    baselineLinhas: { id: string; tarefaId: string | null }[];     // EapBaselineLinha com tarefaId ∈ linhas
  };
  export function impressaoDoPlano(e: EstadoPlano): string;        // string estável; ignora ordem do array e campos fora do plano
  export type PlanoRestauracao = {
    inicioProjeto: { de: string | null; para: string | null } | null;
    apagarLinhas: string[];                                          // ids (filhas vão por cascade)
    criarLinhas: LinhaFoto[];                                        // pais antes dos filhos
    atualizarLinhas: { id: string; campos: Record<string, unknown> }[];   // só CAMPOS_DO_PLANO que diferem
    apagarDependencias: string[]; criarDependencias: DependenciaFoto[]; atualizarDependencias: { id: string; tipo: string; lagDias: string }[];
    apagarAtribuicoes: string[]; criarAtribuicoes: AtribuicaoFoto[]; atualizarAtribuicoes: { id: string; campos: Partial<AtribuicaoFoto> }[];
    religarParcelas: { id: string; marcoId: string }[];              // estava ligada na foto e hoje está nula
    religarBaselineLinhas: { id: string; tarefaId: string }[];
  };
  export function planoDeRestauracao(atual: EstadoPlano, antes: EstadoPlano): PlanoRestauracao;
  export const semMudanca = (p: PlanoRestauracao): boolean;
  ```

- [ ] **Step 1: Write the failing tests** (`estado.test.ts`), com um `estado()` de fábrica:
  - `impressaoDoPlano`: igual para os mesmos dados em outra ordem de array; diferente se muda `nome`; **igual** se muda só `progresso`, `inicioPrevisto`, `codigoEap` ou `status` (campos fora do plano); diferente se muda `lagDias` de uma dependência, `horasPrevistas` de uma atribuição ou `inicioProjeto`.
  - `planoDeRestauracao(atual, antes)`:
    - linha só em `antes` → `criarLinhas` com a linha inteira, e **pai antes do filho** (A mãe e B filha ausentes → [A, B] mesmo se a foto vier [B, A]);
    - linha só em `atual` → `apagarLinhas`; filha de linha apagada **não** repetida (só a mãe);
    - mesma linha com `nome` e `ordem` diferentes → `atualizarLinhas` só com `{ nome, ordem }`;
    - dependência/atribuição só em `antes` → criar (mas **não** se a linha dela também vai ser criada e a foto já a traz? — criar sempre; o serviço cria linhas antes); só em `atual` → apagar; lag/tipo ou horas/principal diferentes → atualizar;
    - dependência de linha que será apagada **não** entra em `apagarDependencias` (cascade cuida);
    - parcela ligada na foto e nula hoje → `religarParcelas`; já ligada a outro marco hoje → não mexe;
    - `semMudanca(planoDeRestauracao(e, e))` é `true`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/desfazer/estado.test.ts` → FAIL (módulo ausente).
- [ ] **Step 3: Implement** `estado.ts` (impressão = `JSON.stringify` de listas ordenadas por id, só com os campos do plano/atribuição/dependência; ordenação topológica de `criarLinhas` por profundidade na foto).
- [ ] **Step 4: Run to verify pass** — mesmo comando, PASS.
- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/desfazer/estado.ts src/modules/planejamento/desfazer/estado.test.ts
git commit -m "feat(planejamento): estado do plano, impressão digital e plano de restauração do desfazer"
```

---

### Task 2: Tabela dos passos do desfazer

**Files:**
- Modify: `prisma/schema.prisma` (model `EapPassoDesfazer`; relações em `Projeto` e `User`)
- Create: `prisma/migrations/<timestamp>_eap_passo_desfazer/migration.sql`

**Interfaces:**
- Produces: model `EapPassoDesfazer { id String @id @default(cuid()); projetoId; userId; rotulo String; antes Json; depoisImpressao String; createdAt DateTime @default(now()); @@index([projetoId, userId, createdAt]); @@map("eap_passo_desfazer") }`, `onDelete: Cascade` nas duas relações.

- [ ] **Step 1:** adicionar o model e as relações inversas (`eapPassosDesfazer EapPassoDesfazer[]` em `Projeto` e `User`).
- [ ] **Step 2:** `npx prisma db push` (aditivo) e `npx prisma generate`; escrever o `migration.sql` à mão (CREATE TABLE, índice, 2 FKs) e `npx prisma migrate resolve --applied <nome>`.
- [ ] **Step 3: Verify** — `npx prisma migrate status` sem drift novo para esta migration; `npx tsc --noEmit -p tsconfig.json` limpo.
- [ ] **Step 4: Commit** `prisma/schema.prisma` + a pasta da migration.

---

### Task 3: Serviço do desfazer (I/O) + smoke

**Files:**
- Create: `src/modules/planejamento/desfazer/service.ts`
- Create: `scripts/smoke-desfazer-eap.ts`
- Modify: `package.json` (`smoke:desfazer-eap`), `CLAUDE.md` (linha do smoke)

**Interfaces:**
- Consumes: Task 1 (`EstadoPlano`, `impressaoDoPlano`, `planoDeRestauracao`, `semMudanca`), Task 2 (model).
- Produces ("server-only"):
  ```ts
  export const MAX_PASSOS = 20;
  export async function lerEstadoDoPlano(db: Db, projetoId: string): Promise<EstadoPlano>;
  export async function comPasso<R>(p: { projetoId: string; userId: string; rotulo: string }, fn: () => Promise<R>): Promise<R>;
  export async function desfazerUltimoPasso(projetoId: string, userId: string): Promise<{ rotulo: string }>;   // ActionError com frase
  export async function limparPassos(projetoId: string): Promise<void>;
  export async function rotuloDoUltimoPasso(projetoId: string, userId: string): Promise<string | null>;
  ```
  `comPasso`: lê o estado antes (se o plano está travado nem lê: a `fn` recusa), executa `fn`; se `fn` lança, relança sem passo; depois lê a impressão; se igual à de antes, não grava; senão grava o passo e apaga o excedente (mantém os 20 mais novos do par projeto+pessoa). Falha ao gravar o passo **não** derruba a ação (log).

- [ ] **Step 1: Write the failing smoke** `smoke-desfazer-eap.ts` (cliente + projeto + disciplina + cronograma rascunho, limpeza no `finally`), árvore: mãe M › filhas A e B, B depende de A, pessoa em A (principal), parcela de contrato ligada a um marco K (dentro de M). Checks:
  - `comPasso` + exclusão (`prisma.eapTarefa.delete(M)`) → `desfazerUltimoPasso` devolve o rótulo; M, A, B, K de volta com **os mesmos ids e `idCorporativo`**, vínculo B→A, atribuição de A (principal), `parcela.marcoId = K.id`;
  - ação que não muda nada (`fn` vazia) → `rotuloDoUltimoPasso` continua o anterior (nenhum passo novo);
  - passo, depois outra edição de `nome` por fora → `desfazerUltimoPasso` lança frase "outra pessoa/alteração depois" e o passo some (`rotuloDoUltimoPasso` anterior ou nulo); o nome editado permanece;
  - 22 passos → só 20 ficam (`prisma.eapPassoDesfazer.count`);
  - cronograma aprovado sem revisão → `desfazerUltimoPasso` lança `MOTIVO_PLANO_TRAVADO`; `limparPassos` zera a pilha;
  - desfazer de **criar** linha apaga a linha; desfazer de **mover/recuar** devolve `parentId` e `ordem`.
- [ ] **Step 2: Run to verify fail** — `npm run smoke:desfazer-eap` (módulo ausente).
- [ ] **Step 3: Implement** `service.ts`. Restauração numa `$transaction` (um `await` por vez), na ordem: início do projeto → apagar atribuições/dependências sobrando → apagar linhas sobrando → criar linhas (pais primeiro, `createMany` linha a linha para preservar a ordem) → atualizar linhas → criar/atualizar dependências → criar/atualizar atribuições → religar parcelas e `EapBaselineLinha`. Reviver datas da foto (`inicioPrevisto`, `fimPrevisto`, `inicioReal`, `fimReal`, `inicioBaseline`, `fimBaseline`, `restricaoData`, `previsaoDesbloqueio`, `createdAt`, `updatedAt`) de ISO para `Date`; `Decimal` entra como string. Recusa por impressão divergente: `ActionError("O plano mudou depois dessa ação (alguém editou). Não dá para desfazer sem sobrescrever o trabalho dele.")` e apaga o passo. Guarda de plano: `exigirPlanoEditavel(projetoId)` no início de `desfazerUltimoPasso`.
- [ ] **Step 4: Run to verify pass** — smoke todo `ok`; `npx vitest run src/modules/planejamento` verde; tsc e eslint limpos.
- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/desfazer/service.ts scripts/smoke-desfazer-eap.ts package.json CLAUDE.md
git commit -m "feat(planejamento): serviço do desfazer da EAP com foto do plano e recusa se outra pessoa editou"
```

---

### Task 4: Ligar o desfazer às ações do plano

**Files:**
- Modify: `src/modules/planejamento/actions.ts`, `src/modules/planejamento/recursos-actions.ts`
- Create: `src/modules/planejamento/desfazer/passo.ts` (`"server-only"`: `comPassoDaAction`)
- Modify: `scripts/smoke-desfazer-eap.ts`

**Interfaces:**
- Consumes: `comPasso`, `limparPassos`, `desfazerUltimoPasso` (Task 3).
- Produces:
  ```ts
  // passo.ts
  export function comPassoDaAction<I, R>(
    cfg: { projetoDe: (i: I) => Promise<string>; rotulo: (i: I) => string | Promise<string> },
    handler: (i: I, ctx: { user: { id: string }; ip?: string }) => Promise<R>,
  ): (i: I, ctx: { user: { id: string }; ip?: string }) => Promise<R>;
  export const projetoDaLinha: (tarefaId: string) => Promise<string>;   // ActionError("Tarefa não encontrada.")
  // actions.ts
  export const desfazerEap // schema { projetoId } → { rotulo: string }
  ```

- [ ] **Step 1: Extend the smoke (failing):** com sessão simulada, chamar o **serviço** que cada action usa não basta; testar `comPassoDaAction` direto com um handler que muda o plano (rótulo montado por `rotulo(i)`), e `aprovar`/`replanejar` chamando `limparPassos` (smoke chama a função `limparPassosAoFecharPlano` exportada de `passo.ts`).
- [ ] **Step 2: Implement** `passo.ts` e aplicar `comPassoDaAction` no handler (3º argumento do `defineAction` inalterado; só o handler é embrulhado) de: `criarEapTarefa` ("Nova tarefa"), `editarEapTarefa` ("Editar \"nome\""), `inserirEapTarefaAcima`, `recuarEapTarefa`, `avancarEapTarefa`, `moverEapTarefa`, `moverEapTarefaNoNivel`, `alinharDisciplinaAoAgrupamento`, `excluirEapTarefa` ("Excluir \"nome\"" — o rótulo lê o nome ANTES de o handler rodar), `definirInicioProjeto`, `vincularDependencia`, `definirPredecessorasDaLinha`, `editarVinculo`, `removerDependencia`, `definirRestricao` e, em `recursos-actions.ts`, `salvarAtribuicao`, `removerAtribuicao`, `definirPrincipal`. `aprovarCronogramaAction` e `replanejarCronograma` chamam `limparPassos` depois de gravar. Nova `desfazerEap` (`...plan`, `acao: "desfazer-eap"`, `entidade: "EapTarefa"`, `entidadeId` = projetoId): `desfazerUltimoPasso` → `aposMudarEap` → `revProjeto` → `{ rotulo }`.
- [ ] **Step 3: Run** — smoke `ok`; `npm test` (guardas) verde; tsc/eslint limpos.
- [ ] **Step 4: Commit** `fix`/`feat` com os arquivos específicos.

---

### Task 5: Ctrl+Z e botão Desfazer na tela

**Files:**
- Modify: `src/app/(dashboard)/planejamento/[projetoId]/page.tsx` e `src/app/(dashboard)/projetos/[id]/eap/page.tsx` (somente se editam: passar `ultimoPasso`), `src/components/planejamento/eap-workspace.tsx`
- Create: `src/components/planejamento/desfazer-botao.tsx`

**Interfaces:**
- Consumes: `desfazerEap`, `rotuloDoUltimoPasso`.
- Produces: `<DesfazerBotao projetoId rotulo travado />` e prop `ultimoPasso: string | null` em `EapWorkspace`.

- [ ] **Step 1:** `DesfazerBotao` (`Undo2`, `Button size="sm" variant="outline"`): texto "Desfazer", `title`/tooltip `Desfazer: <rótulo>` (ctrl+Z); desabilitado sem passo (`title` "Nada para desfazer") ou com plano travado (`MOTIVO_PLANO_TRAVADO`, no `<span>` invólucro — botão desabilitado não recebe o mouse). Clique chama `desfazerEap`, `toast.success("Desfeito: <rótulo>.")`, `router.refresh()`; erro → `toast.error`. Um único caminho (`desfazer()`) para botão e atalho.
- [ ] **Step 2:** no `EapWorkspace`: `keydown` global (`useEffect`, remove no cleanup) para `(ctrl|meta)+z` sem shift, ignorado quando o alvo é `input/textarea/select/[contenteditable]` ou há `[role=dialog]` aberto; `preventDefault` só quando vai agir. Só registra quando `podeGerir && !travado && ultimoPasso`. Botão na barra de ações, ao lado de "Nova tarefa".
- [ ] **Step 3: Verify** — lint e tsc limpos; na tela (porta 3001, Task 6): excluir uma linha de teste → Ctrl+Z → a linha volta; dentro da célula em edição, Ctrl+Z continua do campo de texto.
- [ ] **Step 4: Commit** com os arquivos específicos.

---

### Task 6: Manual, tela e auditoria final

**Files:** `docs/manual/projetos/planejamento.md` (seção "Desfazer"; trocar o aviso de "não dá para desfazer" só onde se refere às linhas da EAP — **Apagar EAP continua sem desfazer**), `docs/manual/novidades.md`, `prints-auditoria/2026-10-22_<hhmm>_eap-fase-b-desfazer/`.

- [ ] **Step 1:** manual e novidades.
- [ ] **Step 2: Tela** (dev na 3001, usuário `claude.admin@dev.senahub`, projeto de teste em rascunho — criar um projeto de teste ou usar o 260208 em revisão e restaurar depois): excluir mãe com filhas → Ctrl+Z → conferir linhas, vínculo e pessoa; botão mostra o rótulo; plano aprovado → botão desabilitado com a frase; 390×844 sem rolagem horizontal; Ctrl+Z dentro da célula não dispara o desfazer da EAP. Prints + `LEIAME.md`.
- [ ] **Step 3:** `npm test`, `npm run lint`, `tsc -p tsconfig.server.json`, `npm run build` (sem `next dev`), smokes `desfazer-eap`, `disciplina-eap`, `eap-integracao`, `recursos-eap`. Revisores: `action-guardian`, `prisma-migration-reviewer`, `client-boundary-auditor`, `ui-state-linter`, `a11y-auditor` e um revisor Opus do branch.
- [ ] **Step 4: Commit** do manual; relatório em pt-BR.
