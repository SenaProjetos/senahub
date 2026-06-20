# Melhorias M1.1 — Rollout de Moeda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar tarefa-a-tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** Eliminar a duplicação de formatadores de moeda — substituir todo formatador BRL local por `brl()` / `brlInteiro()` de `@/lib/utils`, preservando o display atual.

**Architecture:** `brl()` já existe (full-cents). Adicionar `brlInteiro()` (sem centavos) para os sites que hoje usam `maximumFractionDigits: 0`. Rollout mecânico por módulo, com gate de `grep` + `tsc` + `npm test`.

**Tech Stack:** TypeScript · lucide/react · vitest.

## Global Constraints

- `brl(v)` = `R$ 81.000,00` (2 casas). `brlInteiro(v)` = `R$ 81.000` (sem centavos). **Sem compacto "81k"** novo.
- **Escopo = só moeda** (`style:"currency"`). Fora: compactos `Nk` de gráfico, percentuais, `documentos/tokens.ts`.
- Não mudar o que o usuário vê: full-cents → `brl`; sem-centavos → `brlInteiro`.
- Código inglês, UI pt-BR, commits pt-BR. base-ui (`render=`). Prisma de `@/generated/prisma/client`.

---

### Task 1: Adicionar `brlInteiro()` em `lib/utils.ts`

**Files:**
- Modify: `src/lib/utils.ts`
- Test: `src/lib/utils.test.ts`

**Interfaces:**
- Produces: `brlInteiro(v: number): string` → `R$ 81.000` (0 casas).

- [ ] **Step 1: Add the failing test**

Em `src/lib/utils.test.ts`, adicionar dentro do arquivo:

```ts
import { brlInteiro } from "@/lib/utils";

describe("brlInteiro", () => {
  it("formata real sem centavos", () => {
    expect(brlInteiro(81000).replace(/ | /g, " ")).toBe("R$ 81.000");
    expect(brlInteiro(1234.9).replace(/ | /g, " ")).toBe("R$ 1.235");
  });
});
```

(adicionar `brlInteiro` ao import existente no topo do teste)

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: FAIL — `brlInteiro` não exportado.

- [ ] **Step 3: Implement**

Em `src/lib/utils.ts`, após `brl`:

```ts
/** Moeda BRL sem centavos: R$ 81.000 (p/ KPIs/dashboards). */
export function brlInteiro(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat(ui): brlInteiro (moeda sem centavos) em lib/utils"
```

---

### Tasks 2–N: Rollout por módulo (regra única)

**Regra de transformação (aplicar a cada arquivo do batch):**

1. **Remover** declaração local: `const brl = (v) => v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" })` (e a variante `maximumFractionDigits:0`).
2. **Substituir** chamadas inline `EXPR.toLocaleString("pt-BR", { style:"currency", currency:"BRL" })` por `brl(EXPR)`; e a variante sem-centavos por `brlInteiro(EXPR)`.
3. **Substituir** `new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(EXPR)` por `brl(EXPR)`.
4. **Adicionar** import: incluir `brl`/`brlInteiro` num `import { … } from "@/lib/utils"` (juntar ao import de `cn` se já existir; senão criar a linha). Em arquivos server (`actions.ts`, `historico.ts`) o import de utils é válido (sem `server-only`).
5. **Não** tocar: compactos `Nk`, percentuais (`maximumFractionDigits:1` com `%`), `documentos/tokens.ts`.

**Batches (commit por batch; `npx tsc --noEmit` ao fim de cada):**

- [ ] **Task 2 — financeiro** (`src/components/financeiro/**`, `src/app/(dashboard)/financeiro/**`, `src/modules/financeiro/**`): full → `brl`; sem-centavos (`aging-widget`, `dfc-view`, `orcamento-view`, `balanco/page`) → `brlInteiro`. `tsc`. Commit `refactor(financeiro): usa brl/brlInteiro de lib/utils`.
- [ ] **Task 3 — comercial** (`src/components/comercial/**`): `funil-board`, `meta-card` → `brlInteiro`; resto → `brl`. `tsc`. Commit `refactor(comercial): usa brl de lib/utils`.
- [ ] **Task 4 — licitações** (`src/components/licitacoes/**`, `src/modules/licitacoes/**`): repontar `_shared.ts` `brl` para reexportar de utils (`export { brl } from "@/lib/utils"`) **ou** trocar imports para `@/lib/utils` e remover o `brl` de `_shared`; trocar os 4 `Intl.NumberFormat` server por `brl`. `tsc`. Commit `refactor(licitacoes): unifica brl em lib/utils`.
- [ ] **Task 5 — dashboard + página inicial** (`src/components/dashboard/**`, `src/app/(dashboard)/page.tsx`): `page.tsx` usa sem-centavos → `brlInteiro`; **não** tocar `receita-chart`/compactos. `tsc`. Commit `refactor(dashboard): usa brlInteiro de lib/utils`.
- [ ] **Task 6 — rh + ponto + folha** (`src/components/rh/**`, `src/components/ponto/**`, `src/modules/rh/**`): full → `brl`. `tsc`. Commit `refactor(rh): usa brl de lib/utils`.
- [ ] **Task 7 — restantes** (clientes, projetos, planejamento, recursos, agenda, suporte, documentos visual, qualquer outro do inventário): full → `brl`; sem-centavos → `brlInteiro`. `tsc`. Commit `refactor(ui): usa brl/brlInteiro de lib/utils (restantes)`.

---

### Task 8: Gate final

- [ ] **Step 1: Verificar que não sobra formatador de moeda local**

Run:
```bash
grep -rnE "style: ?\"currency\"|new Intl\.NumberFormat\([^)]*currency" src/components src/modules src/app
```
Expected: **0** resultados (todos centralizados; `lib/utils.ts` é o único). Se sobrar, é um site esquecido → aplicar a regra.

```bash
grep -rnE "const brl ?=" src/components src/modules src/app
```
Expected: **0** (nenhuma declaração local de `brl`).

- [ ] **Step 2: Suíte + tipos**

Run: `npm test` → all pass. `npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit (se o gate exigiu ajustes)**

```bash
git add -A && git commit -m "refactor(ui): fecha gate do rollout de moeda (M1.1)"
```

---

## Self-Review

- **Cobertura:** todo `style:"currency"` (full → `brl`, sem-centavos → `brlInteiro`) e `Intl.NumberFormat` currency migrados (Tasks 2–7), com gate objetivo (Task 8). `brlInteiro` adicionado (Task 1).
- **Fora de escopo declarado:** compactos `Nk`, percentuais, `documentos/tokens.ts` — registrados na regra, não tocados.
- **Placeholders:** a regra de transformação é única e explícita; batches por módulo evitam enumerar ~50 edits idênticos. Cada batch tem gate `tsc`; gate final por `grep`.
- **Tipos:** `brl`/`brlInteiro` já definidos (Task 1 + M1.0), assinatura `(v:number)=>string`.
