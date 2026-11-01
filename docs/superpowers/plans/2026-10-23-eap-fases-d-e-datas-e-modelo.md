# EAP — Fases D (datas na célula) e E (salvar a EAP como modelo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitar o início ou o término de uma tarefa direto na tabela (duração e restrição saem sozinhas), mudar o início do projeto sem prender as datas fixadas, e salvar a EAP de um projeto como modelo para outro.

**Architecture:** Regras de data puras (`datas-linha.ts`: leitura da data digitada, duração pelo término, deslocamento de restrições) sobre o calendário de dias úteis que o motor já usa; serviços finos em `datas-linha-service.ts` (início/término da linha, "mover junto"); três ações embrulhadas em `comPassoDaAction` (desfazer da Fase B). A conversão EAP → modelo é pura (`estrutura-do-projeto.ts`, mesmo formato `estruturaModeloSchema` v1 da importação) e grava por `salvarModeloDeEap`, o serviço que já existe.

**Tech Stack:** Next 15 / React 19, Prisma 7, vitest, smokes via `tsx --tsconfig tsconfig.server.json`.

**Spec:** [docs/superpowers/specs/2026-10-22-eap-apontamentos-equipe-design.md](../specs/2026-10-22-eap-apontamentos-equipe-design.md) — Fases D e E.

## Global Constraints

- Código em inglês; texto de tela, mensagem e commit em pt-BR. Toda mutação por `defineAction`, handler em `comPassoDaAction` (um passo de desfazer por ação). Plano travado recusa com `MOTIVO_PLANO_TRAVADO`.
- Datas são `YYYY-MM-DD` (`Dia`), contas de dia útil sempre pelo calendário do projeto (`planoDoProjeto(...).calendario`, feriados inclusos) — nunca `new Date()` local.
- **Término digitado** → duração = dias úteis do início atual (o do MOTOR) ao término, inclusive; **não** cria restrição. Término antes do início recusa; término sem nenhum dia útil recusa e manda digitar 0 na duração (marco é decisão explícita). Agrupamento e marco não têm término editável.
- **Início digitado** → restrição `iniciar_nao_antes_de` (o alfinete) na data; a duração se mantém; substitui a restrição que a linha tivesse. Agrupamento não edita início. Se o motor não consegue começar na data (predecessora, dia não útil), a tela avisa a data real.
- **Mudar o início do projeto** com linhas de data fixada: a tela pergunta **Mover junto** (desloca TODA `restricaoData` pelos mesmos dias úteis do deslocamento do início, nos seis tipos) ou **Manter**. Padrão da action = manter.
- Modelo salvo: formato `estruturaModeloSchema` v1; sem pessoas, horas, %, datas reais, restrições; teto 1200 linhas; disciplina só se tem par no catálogo global; fase só se for do catálogo global; tipos fora de `fas|disc|res|atv|mrc` viram agrupamento (`res`) ou atividade.
- Stage arquivos específicos; auditoria final (`docs/PROTOCOLO_AUDITORIA_FINAL.md`, nível 3), tela na porta 3001 (390×844: `scrollWidth` 390).

## Review Focus

1. **Término digitado em fim de semana, antes do início, em marco e em agrupamento** → recusa com a frase, nada muda. (Task 1 e 2.)
2. **Início digitado antes do que as predecessoras permitem** → grava a restrição, o motor mantém a data real, a tela avisa. (Task 2.)
3. **Mudar o início do projeto com "mover junto"** → toda restrição anda os mesmos dias úteis; com "manter", nenhuma muda; sem linha fixada a pergunta nem aparece. (Task 1, 2 e 3.)
4. **Salvar como modelo** com linha de disciplina sem par no catálogo, fase do próprio projeto, tipo `prj/pct/loc/sis`, predecessora entre linhas, `Externo` e mais de 1200 linhas. (Task 4.)
5. **Aplicar o modelo salvo em outro projeto** devolve a mesma árvore, durações, vínculos e marcos. (Task 5 smoke.)

---

### Task 1: Regras puras de data da linha

**Files:**
- Create: `src/modules/planejamento/datas-linha.ts`, `src/modules/planejamento/datas-linha.test.ts`

**Interfaces:**
- Consumes: `Calendario`, `Dia`, `diasUteisEntre`, `proximoDiaUtil`, `somarDiasUteis` de `@/lib/calendario-trabalho`.
- Produces:
  ```ts
  export function lerDataDigitada(texto: string, hoje: Dia): { ok: true; dia: Dia } | { ok: false; erro: string };
  export function duracaoPeloTermino(p: { inicio: Dia; fim: Dia; cal: Calendario }): { ok: true; dias: number } | { ok: false; motivo: string };
  export function deslocamentoEmDiasUteis(de: Dia, para: Dia, cal: Calendario): number;                 // com sinal
  export function moverRestricoes(linhas: readonly { id: string; restricaoData: Dia | null }[], de: Dia, para: Dia, cal: Calendario): { id: string; restricaoData: Dia }[];
  ```

- [ ] **Step 1: Write the failing tests**
  - `lerDataDigitada("05/10/2026", hoje)` → `2026-10-05`; `"5/10/26"` → `2026-10-05`; `"05/10"` assume o ano de `hoje`; `"2026-10-05"` aceita; `"31/02/2026"`, `"abc"`, `""`, `"32/01/2026"` → erro `Data inválida. Use dd/mm/aaaa.`
  - `duracaoPeloTermino`: seg 2026-10-05 → sex 2026-10-09 = 5; seg → seg seguinte = 6; mesmo dia útil = 1; fim sábado depois de sexta (início seg, fim sáb 10/10) = 5 (sábado não conta); fim antes do início → `motivo` "O término não pode ser antes do início (05/10/2026)."; início sáb e fim dom (sem dia útil) → "Esse término não tem dia útil depois do início. Para um marco, digite 0 na duração."; feriado no meio não conta (calendário com feriado 2026-10-07 → seg→sex = 4).
  - `deslocamentoEmDiasUteis`: 2026-10-05 → 2026-10-12 = 5; → 2026-10-05 = 0; 2026-10-12 → 2026-10-05 = -5; para sábado normaliza para segunda; com feriado no caminho conta menos.
  - `moverRestricoes`: sem data é ignorada; `2026-10-08` com deslocamento +5 → `2026-10-15`; −5 volta; data em fim de semana normaliza para o dia útil antes de somar; deslocamento 0 devolve `[]`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/datas-linha.test.ts`.
- [ ] **Step 3: Implement** (`criarCalendario` com `feriados` nos testes de feriado).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(planejamento): regras puras de data da linha da EAP`.

---

### Task 2: Serviços de data + smoke

**Files:**
- Create: `src/modules/planejamento/datas-linha-service.ts`, `scripts/smoke-eap-datas.ts`
- Modify: `package.json` (`smoke:eap-datas`), `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1; `planoDoProjeto`, `reagendarProjeto` (`agenda.ts`).
- Produces ("server-only"):
  ```ts
  export async function definirInicioDaLinha(p: { id: string; data: Dia }): Promise<{ projetoId: string }>;
  export async function definirTerminoDaLinha(p: { id: string; data: Dia }): Promise<{ projetoId: string; duracaoDias: number }>;
  export async function moverRestricoesDoProjeto(projetoId: string, de: Dia | null, para: Dia): Promise<{ movidas: number }>;
  ```
  Recusas: agrupamento (`"Agrupamento: o início e o término vêm das tarefas de dentro."`), marco no término (`"Marco não tem término: ele é uma data só. Mude o início."`), `ActionError` com as frases da Task 1; linha inexistente (`"Tarefa não encontrada."`). O início/término da linha lido pelo MOTOR (`planoDoProjeto`), não pela coluna.

- [ ] **Step 1: Write the failing smoke** (`smoke-eap-datas.ts`, projeto de teste com `inicioProjeto` 2026-10-05, `P › A (5d), B (3d, depende de A)`, marco `M`): término de A para `2026-10-07` → duração 3, **sem** restrição; para sábado/antes do início/marco/agrupamento → recusa e nada muda; início de B para `2026-10-30` → `restricaoTipo = iniciar_nao_antes_de`, `restricaoData` certa e (após `reagendarProjeto`) `inicioPrevisto` = 30/10; início de B para `2026-10-01` (antes do que A permite) → restrição gravada e `inicioPrevisto` continua depois de A; início de P (agrupamento) → recusa; início do marco ok; `moverRestricoesDoProjeto(projeto, "2026-10-05", "2026-10-12")` → toda `restricaoData` anda 5 dias úteis, `movidas` conta quantas, linha sem restrição não muda; `de = null` → `movidas 0`.
- [ ] **Step 2: Run to verify fail** — módulo ausente.
- [ ] **Step 3: Implement.** `definirTerminoDaLinha` lê o início do motor e o calendário de `planoDoProjeto`, aplica `duracaoPeloTermino`, grava `duracaoDias`. `definirInicioDaLinha` grava a restrição (sobrescreve). `moverRestricoesDoProjeto` lê as linhas com `restricaoData`, calcula com `moverRestricoes` e grava numa transação.
- [ ] **Step 4: Run to verify pass**; `tsc`, `eslint` limpos.
- [ ] **Step 5: Commit** `feat(planejamento): início e término da linha pela data e "mover junto" no início do projeto`.

---

### Task 3: Ações e telas das datas

**Files:**
- Modify: `src/modules/planejamento/actions.ts`, `src/components/planejamento/plano-gantt.tsx`, `src/components/planejamento/eap-workspace.tsx`, `src/components/planejamento/saude-painel.tsx`
- Create: `src/components/planejamento/inicio-projeto-dialog.tsx`

**Interfaces:**
- Produces:
  ```ts
  // actions.ts (...plan, comPassoDaAction, exigirPlanoEditavelDaLinha, aposMudarEap)
  export const definirInicioEapTarefa;    // { id, data } → { inicio: Dia; pedido: Dia }   (inicio = o que o motor deu)
  export const definirTerminoEapTarefa;   // { id, data } → { duracaoDias: number }
  // definirInicioProjeto ganha { moverRestricoes: boolean (padrão false) } e devolve { movidas: number }
  // plano-gantt.tsx
  export type CampoEditavel = "nome" | "duracao" | "progresso" | "pred" | "inicio" | "termino";
  EdicaoDeCampo ganha { campo: "inicio" | "termino"; data: Dia }
  ```

- [ ] **Step 1: Implement** as ações (rótulos do desfazer: `Início de "nome"`, `Término de "nome"`; `definirInicioProjeto` chama `moverRestricoesDoProjeto` quando `moverRestricoes` e o início mudou, depois de gravar o novo início).
- [ ] **Step 2: PlanoGantt** — as colunas Início e Término (modo planejamento) viram editáveis para linha-folha com plano editável (marco: só Início); texto inicial `dd/mm/aa`; ao confirmar, `lerDataDigitada(texto, hoje)` (erro vai para `onErro`) e `onEditarCampo(t, { campo, data })`; dica `title` "Digite a data (dd/mm/aaaa). O início fixa a tarefa (alfinete); o término recalcula a duração."
- [ ] **Step 3: Workspace** — `editarCampo` roteia `inicio`/`termino` para as ações novas; início cujo resultado do motor difere do pedido → `toast.warning("A tarefa só pode começar em dd/mm/aaaa (dia útil e depois das predecessoras).")`; término → `toast.success("Duração: N dias úteis.")`.
- [ ] **Step 4: Início do projeto** — `SaudePainel` recebe `linhasComDataFixada` (workspace: `tarefas.filter((t) => t.restricaoTipo).length`). Ao definir um início **diferente** do atual com `linhasComDataFixada > 0`, abre `InicioProjetoDialog` ("N tarefa(s) têm data fixada — **Mover junto** desloca essas datas pelos mesmos dias úteis; **Manter** deixa as datas onde estão, e elas podem não acompanhar o novo início"; botões Mover junto / Manter as datas / Cancelar). Sem linha fixada, grava direto.
- [ ] **Step 5: Verify** — tsc, eslint, `npm test`, smokes `eap-datas`, `desfazer-eap`.
- [ ] **Step 6: Commit** `feat(planejamento): editar início e término na tabela e escolher "mover junto" ao mudar o início do projeto`.

---

### Task 4: EAP do projeto → estrutura de modelo (pura)

**Files:**
- Create: `src/modules/planejamento/modelos/estrutura-do-projeto.ts`, `src/modules/planejamento/modelos/estrutura-do-projeto.test.ts`

**Interfaces:**
- Consumes: `estruturaModeloSchema`/`EstruturaModelo`/`LinhaModelo` (`modelos/estrutura.ts`).
- Produces:
  ```ts
  export type LinhaDoProjeto = {
    id: string; parentId: string | null; ordem: number; nome: string; tipoEap: string; duracaoDias: number;
    disciplinaId: string | null; etapaId: string | null; deTerceiro: boolean;
    predecessoras: { predecessoraId: string; tipo: "fs" | "ss" | "ff" | "sf"; lagDias: number }[];
  };
  export function estruturaDoProjeto(p: {
    linhas: readonly LinhaDoProjeto[];
    /** `Disciplina.id` do projeto → `DisciplinaCatalogo.id` (ausente = sem par). */
    catalogoDaDisciplina: ReadonlyMap<string, string>;
    /** Fases do catálogo GLOBAL (`PranchaCatalogo`, `projetoId` nulo). */
    fasesGlobais: ReadonlySet<string>;
    jornadaMinutos?: number;
  }): { estrutura: EstruturaModelo; avisos: string[]; disciplinasSemPar: string[] };
  ```
  Regras: pais antes dos filhos na ordem; `tipoEap` `fas|disc|res|atv|mrc` fica, `prj|pct|loc|sis` vira `res`; marco = duração 0; agrupamento com duração 0; `disciplinaCatalogoId` pelo mapa (sem par → `null` + aviso com o nome); `etapaId` só se está em `fasesGlobais`; `predecessoras` só entre linhas do conjunto (ids do projeto servem de ids do modelo); `percentuaisPorFase` `{}`, `mapaDisciplina`/`mapaFase` `{}`, `avisos` com as ressalvas; mais de 1200 linhas → `Error` com a frase do schema.

- [ ] **Step 1: Write the failing tests:** estrutura passa em `estruturaModeloSchema.safeParse`; árvore/ordem/duração/marco preservados; vínculo entre linhas e a defasagem; vínculo para linha fora do conjunto some; tipo `prj` vira `res`; disciplina sem par → `null`, nome em `disciplinasSemPar` e em `avisos`; fase do projeto (fora de `fasesGlobais`) → `null`; `deTerceiro` preservado; 1201 linhas → lança.
- [ ] **Step 2: Run to verify fail.** **Step 3: Implement.** **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(planejamento): converter a EAP de um projeto na estrutura de um modelo`.

---

### Task 5: Salvar como modelo (serviço, ação, tela) + smoke

**Files:**
- Create: `src/modules/planejamento/modelos/salvar-do-projeto-service.ts`, `src/components/planejamento/modelos/salvar-como-modelo-dialog.tsx`
- Modify: `src/modules/planejamento/modelos/actions.ts`, `src/components/planejamento/eap-workspace.tsx`, `src/app/(dashboard)/planejamento/[projetoId]/page.tsx` (tipos de empreendimento), `scripts/smoke-modelo-eap.ts` (ou `smoke-eap-datas.ts`)

**Interfaces:**
- Produces:
  ```ts
  export async function salvarEapDoProjetoComoModelo(p: { projetoId: string; nome: string; descricao: string | null; tipoEmpreendimentoId: string | null; autorId: string }): Promise<{ id: string; totalLinhas: number; totalMarcos: number; avisos: string[] }>;
  export const salvarEapComoModelo;   // action em modelos/actions.ts: { projetoId, nome (2..120), descricao?, tipoEmpreendimentoId? } → o retorno acima
  ```
  Lê as linhas, vínculos, `Externo` e as disciplinas do projeto; `catalogoDaDisciplina` por `Disciplina.disciplinaId`; fases globais por `PranchaCatalogo` (`categoria "fase"`, `projetoId` nulo); chama `estruturaDoProjeto` e `salvarModeloDeEap` (arquivoNome `null`; `descricao` ganha "Salvo do projeto <código>" quando vazia). Projeto sem EAP → `ActionError("Este projeto ainda não tem EAP para salvar.")`.

- [ ] **Step 1: Write the failing smoke:** projeto com EAP (grupo disciplinado, atividades, marco, vínculo, uma linha `Externo`) → salvar → o modelo existe com `totalLinhas`/`totalMarcos` certos e a estrutura lê por `lerEstrutura`; **aplicar o modelo salvo em outro projeto vazio** (`aplicarModeloNoProjeto`) devolve as mesmas linhas, durações, marcos e o vínculo (comparar nomes/duração/tipo e o par de vínculo por nome); projeto sem EAP recusa.
- [ ] **Step 2: Run to verify fail. Step 3: Implement** serviço + ação + diálogo "Salvar como modelo" (nome, descrição, tipo de empreendimento; prévia com o número de linhas/marcos; avisos do que ficou de fora; sucesso com link para `/planejamento/modelos`); botão no cabeçalho do workspace (só `podeGerir` com EAP).
- [ ] **Step 4: Run** smoke, tsc, eslint, `npm test`. **Step 5: Commit** `feat(planejamento): salvar a EAP de um projeto como modelo`.

---

### Task 6: Manual, tela e auditoria final

- [ ] **Step 1:** manual (`planejamento.md`: "Datas direto na tabela", início do projeto com "mover junto", "Salvar como modelo"; `modelos-de-eap.md`: nova origem do modelo) e novidades.
- [ ] **Step 2: Tela** (260208 em revisão, restaurar depois): digitar um término → duração; digitar um início → alfinete; mudar o início do projeto → janela com as três opções; "Salvar como modelo" → modelo na lista (apagar depois); 390×844 sem rolagem horizontal. Prints + `LEIAME.md` em `prints-auditoria/2026-10-23_<hhmm>_eap-fases-d-e/`.
- [ ] **Step 3:** `npm test`, lint, `tsc -p tsconfig.server.json`, build (sem `next dev`), smokes `eap-datas`, `eap-lote`, `desfazer-eap`, `disciplina-eap`, `eap-integracao`, `modelo-eap`. Revisores: `action-guardian`, `client-boundary-auditor`, `ui-state-linter`, `a11y-auditor` e um Opus do branch.
- [ ] **Step 4: Commit** do manual; relatório em pt-BR.
