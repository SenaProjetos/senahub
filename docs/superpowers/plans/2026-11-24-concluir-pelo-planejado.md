# 100% sem datas = concluída como planejado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 100% informado numa atividade sem término real grava início/término real pela linha de base (ou previsto), limitado a hoje, e conclui a linha.

**Architecture:** Regra pura em `src/modules/planejamento/concluir-pelo-planejado.ts`; os três caminhos do % (`editarLinhaNoBanco`, `salvarLinhaNoBanco`, `aplicarExecucao`) chamam a regra e gravam na mesma transação do %. Script de carga para as linhas antigas.

**Tech Stack:** Next 15 Server Actions, Prisma 7, vitest, tsx smokes.

**Spec:** `docs/superpowers/specs/2026-11-24-concluir-pelo-planejado-design.md`

## Global Constraints

- Datas `YYYY-MM-DD`; "hoje" nas actions = `paraDia(inicioDoDiaUtc())` (igual a `registrarExecucao`); script usa `diaDeSaoPaulo()`.
- Escrita condicionada ao estado lido (`updateMany` + `count !== 1` → "A tarefa mudou enquanto você editava. Atualize a tela e tente de novo.").
- Datas reais só com `cronograma:executado`; sem ela o 100% grava só o número.
- Textos de tela em pt-BR.

## Review Focus

- Término da linha de base depois de hoje → término = hoje, início = min(início base, hoje). (Task 1 test)
- Início real já gravado depois do término da base → término = início real. (Task 1 test)
- Linha sem linha de base → previsto. (Task 1 test)
- Linha bloqueada / marco / agrupamento com 100% → não conclui. (Task 1 test `concluiPeloPercentual`)
- Baixar o % de linha concluída pela célula → recusa. (Task 1 test + smoke)

---

### Task 1: Regra pura

**Files:** Create `src/modules/planejamento/concluir-pelo-planejado.ts` + `.test.ts`

**Produces:**
- `datasPeloPlanejado(l: { inicioReal: Dia|null; inicioBaseline: Dia|null; fimBaseline: Dia|null; inicioPrevisto: Dia|null; fimPrevisto: Dia|null }, hoje: Dia): { inicioReal: Dia; fimReal: Dia; origem: "linha_base" | "previsto" } | null`
- `concluiPeloPercentual(l: { tipoEap: string; ehResumo: boolean; status: StatusEap; progresso: number; fimReal: Dia|null }, novo: number): boolean`
- `motivoParaBaixarPercentual(l: { ehResumo: boolean; status: StatusEap; progresso: number }, novo: number): string | null` → `MOTIVO_REABRIR_NA_CELULA` quando `status === "con"`, não agrupamento e `novo < progresso`.
- `rotuloDaOrigem(origem)`: "linha de base" | "datas previstas".

Tests: base no passado → datas da base; fim base > hoje → fim hoje; início base > hoje → início hoje; início real mantido; início real > fim base → fim = início real; sem base (uma das duas nula) → previsto; nada → null; `concluiPeloPercentual` falso para marco, agrupamento, bloqueada, sus/can/arq/con, com término real, % já 100, novo < 100.

### Task 2: "Atualizar tarefa" (`aplicarExecucao`)

**Files:** Modify `execucao.ts`, `execucao.test.ts`, `execucao-service.ts`, `components/planejamento/execucao-dialog.tsx`, `scripts/smoke-progresso-historico.ts`

- `LinhaParaExecucao` ganha opcionais `inicioBaseline/fimBaseline/inicioPrevisto/fimPrevisto` (Dia|null). Com `progresso === 100`, sem término, não marco e `datasPeloPlanejado` ≠ null: usa essas datas (o início informado vence) e segue o fluxo normal (conclui). Sem datas planejadas: recusa como hoje.
- `ResultadoExecucao` ok ganha `datasPeloPlanejado: "linha_base" | "previsto" | null`.
- Serviço lê as 4 datas e devolve `datasPeloPlanejado`; diálogo aceita 100 sem término (max 100 se não está reabrindo), dica "100% sem término conclui com as datas da linha de base (limitadas a hoje)." e toast com a origem.
- Smoke: troca a recusa por "100% sem datas conclui pela linha de base".

### Task 3: Célula e painel (`linha-service.ts`)

- `editarLinhaNoBanco(i, autorId, opcoes?: { hoje: Dia; podeExecucao: boolean })` → `{ projetoId, conclusao: { origem, inicioReal, fimReal } | null }`; `salvarLinhaNoBanco(i, autorId, opcoes?)` idem no bloco do %.
- Antes de gravar: `motivoParaBaixarPercentual` → `ActionError`. Se `opcoes?.podeExecucao && concluiPeloPercentual(...)` e `datasPeloPlanejado` ≠ null: na mesma transação, `updateMany({ id, status, fimReal: null })` com datas + `status: "con"`.
- Actions `editarEapTarefa`/`salvarLinhaEap` passam `{ hoje, podeExecucao: await can(user, "cronograma", "executado") }` e devolvem `conclusao`; workspace e painel mostram toast.
- Smoke novo `scripts/smoke-concluir-pelo-planejado.ts` (`npm run smoke:concluir-pelo-planejado`): célula 100% → con + datas da base; sem permissão → só %; baixar % de concluída → recusa; bloqueada → só %.

### Task 4: Carga das linhas antigas + docs

- `scripts/concluir-pelo-planejado.ts` (`npm run eap:concluir-pelo-planejado [-- --gravar]`), mesmo molde de `scripts/inicio-real-pelo-ponto.ts`: linhas `progresso: 100, fimReal: null`, status fora de sus/can/arq/blq/con, atividade sem filhas; AuditLog `concluir-pelo-planejado` na transação; reagenda + cards + previsões.
- Manual (`docs/manual/`) e CLAUDE.md (linha do comando + parágrafo curto na seção EAP).
