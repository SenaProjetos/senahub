# Melhorias M1.2 — Rollout de Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps `- [ ]`.

**Goal:** Centralizar a formatação de datas — trocar `toLocaleDateString("pt-BR")` (e as 2 variantes cobertas) pelos helpers de `@/lib/utils`, preservando o display.

**Architecture:** Helpers já existem (`formatarData`, `formatarMesCurto`, `formatarDiaMes`). Rollout mecânico por módulo via subagentes paralelos, gate `grep`+`tsc`+`npm test` central.

## Global Constraints

- `formatarData(d)` = `dd/mm/aaaa`; `formatarMesCurto(d)` = `jun` (já sem ponto); `formatarDiaMes(d)` = `07/06`. Aceitam `Date | string | null` (string `yyyy-mm-dd` parseada como local).
- **Só** os 3 padrões cobertos. **Fora**: variantes weekday / month-long+year / day+month-short / 2-digit-year; `date-fns`; `toLocaleString` (date+hora) da agenda; `src/modules/documentos/**`.
- Código inglês, UI pt-BR, commits pt-BR.

---

## Regra de transformação (única, aplicada por cada agente no seu escopo)

1. `EXPR.toLocaleDateString("pt-BR")` → `formatarData(EXPR)`.
2. `new Date(EXPR).toLocaleDateString("pt-BR")` → `formatarData(EXPR)`.
3. `EXPR.toLocaleDateString("pt-BR", { month: "short" })` (com ou sem `.replace(".", "")` em seguida) → `formatarMesCurto(EXPR)`.
4. `EXPR.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })` → `formatarDiaMes(EXPR)`.
5. Adicionar `import { formatarData, ... } from "@/lib/utils"` (juntar ao import de `cn`/`brl` se já houver).
6. **Não tocar** (deixar inline): `{ weekday: ... }`, `{ month: "long", year: "numeric" }`, `{ day: "2-digit", month: "short" }`, `{ ..., year: "2-digit" }`, qualquer `date-fns`, `toLocaleString` (date+hora), e tudo em `src/modules/documentos/**`.

## Batches (subagentes paralelos; cada um NÃO roda tsc, NÃO commita)

- **A — financeiro:** `src/components/financeiro/**`, `src/app/(dashboard)/financeiro/**`, `src/modules/financeiro/**`.
- **B — rh + licitações + comercial:** `src/components/rh/**`, `src/components/licitacoes/**`, `src/components/comercial/**`, `src/app/(dashboard)/licitacoes/**`.
- **C — projetos + portal + configurações + planejamento:** `src/components/projetos/**`, `src/app/(dashboard)/projetos/**`, `src/app/(dashboard)/portal/**`, `src/components/configuracoes/**`, `src/components/planejamento/**`, `src/app/(dashboard)/planejamento/**`.
- **D — restantes:** `src/components/tarefas/**`, `src/components/suporte/**`, `src/components/shell/**`, `src/components/ponto/**`, `src/components/juridico/**`, `src/components/documentos/**`, `src/modules/dashboard/**`, `src/app/a/**`. **Excluir** `src/modules/documentos/**`.

## Gate central (após todos os agentes)

```bash
# bare + variantes cobertas não podem sobrar fora de lib/utils:
grep -rnE "toLocaleDateString\(\"pt-BR\"\)" src | grep -v "src/lib/utils.ts"
grep -rnE "toLocaleDateString\(\"pt-BR\", ?\{ ?month: ?\"short\"" src
grep -rnE "toLocaleDateString\(\"pt-BR\", ?\{ ?day: ?\"2-digit\", ?month: ?\"2-digit\" ?\}" src
```
Esperado: só os 5 one-offs documentados podem aparecer (weekday/long/short/2-digit-year) — qualquer outro é site esquecido. Depois `npx tsc --noEmit` (exit 0) e `npm test` (verde). Commit por batch.

## Self-Review
- Cobre os 3 padrões com helper; one-offs e date-fns explicitamente fora. Gate objetivo. Tipos: helpers já definidos em M1.0.
