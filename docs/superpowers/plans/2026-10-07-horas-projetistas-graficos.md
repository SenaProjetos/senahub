# Horas dos projetistas em gráficos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fixed "Horas por dia" card into a period-aware hours view: a ranking plus a daily comparison (lines) or a per-project breakdown (stacked bars) in RH → Produtividade, a "Minhas horas" tab in Ponto, and a home-page card that links to that tab.

**Architecture:** Three pure, client-safe modules in `src/modules/rh/produtividade/` (`periodo.ts` = period parsing and buckets, `horas.ts` = aggregation of `SessaoTrabalho` into hours per person/day/destination, `acoes-horas.ts` = context-menu descriptor) are unit-tested. One server query, `horasProjetistas()`, reads the sessions and calls `agregarHoras`. Every screen and the card use it, so the same person and day never show two numbers. The UI is hand-written SVG in `src/components/rh/horas/`, the repo's chart pattern (no chart library). Access moves from `requireRole(HR_ADMIN_ROLES)` to a new fine permission `rh:produtividade`, granted to existing profiles by a data migration.

**Tech Stack:** Next.js 15 App Router (RSC + client components), React 19, Prisma 7, Vitest (node env), Tailwind, base-ui shadcn, lucide-react 1.x.

**Spec:** `docs/superpowers/specs/2026-10-07-horas-projetistas-graficos-design.md`

## Global Constraints

- Code and identifiers in English or matching the existing Portuguese domain names; **all user-visible strings in pt-BR**; commits semantic + pt-BR, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/horas-graficos`, created from `dev-vscode` (NOT on `feat/integracao-contabil`). Stage specific files only — never `git add -A`/`.`; check `git show --stat` after each commit.
- Day = Brasília local day (`diaLocal` / `minutosPorDiaSessao` from `src/modules/ponto/engine.ts`). Days are `YYYY-MM-DD` strings.
- Rounding only at the edge: accumulate **minutes**, convert to hours with 1 decimal at output.
- Period: shortcuts `7 dias · 14 dias (padrão) · 30 dias · Mês atual · Mês anterior` + free range. URL `?de=AAAA-MM-DD&ate=AAAA-MM-DD`. No cap. More than **92** days → chart and table group **by week**, title says "por semana — período longo". `ate` after today is cut to today.
- Comparison limit: **5** people. Disabled reason text: `Compare no máximo 5 projetistas.`
- Stacked breakdown: top **5** projects + `Outros projetos` + `Reuniões` (internal + external) + `Sem projeto`.
- New permission pair `rh:produtividade`, read-only, `abre: "Produtividade"`. It needs a catalog entry, a `PERMISSOES_BASE` row (supervisor + administrativo) and a data migration. Without the migration, the pair is born denied for everyone.
- Cliente never sees hours (no portal change; `/ponto` already excludes `cliente`).
- "Minhas horas" always shows the logged-in user. It never accepts `?u=`.
- Pure files (`periodo.ts`, `horas.ts`, `acoes-horas.ts`) must not import Prisma, `server-only` or Next. They are imported by client components (see memory "pureza transitiva": follow every import to the end).
- Colors only through CSS tokens (`var(--chart-1..5)`, `var(--info)`, `var(--muted-foreground)`), never hex.
- Every dashboard page opens with `CabecalhoPagina`; the subnav renders right AFTER it.
- Done = 390×844 has `document.documentElement.scrollWidth === 390`, and at 1366×768 with the menu open the header does not overlap the top bar.

## Review Focus

1. **Session crossing midnight / still open** — hours split across both days; an open session counts up to "now", never into the future. Pinned in Task 2 tests.
2. **Session with `tipoAlocacao = projeto` but `projeto = null`** (project row gone / bad data) — counts as "Sem projeto", never crashes and never loses the hours. Pinned in Task 2.
3. **Garbage URL params** (`?de=2026-02-30`, `?de=abc`, `de > ate`, `de` in the future) — fall back to the default 14 days, no 500. Pinned in Task 1.
4. **Period spanning a week boundary that starts mid-week** (e.g. Wed → next Tue, > 92 days) — the first bucket starts at the period's first day, not at a Monday outside the range, and no hours are dropped or double-counted. Pinned in Task 1 (`bucketsDoPeriodo`) and Task 2 (`somarPorBucket` sums to the total).
5. **Person with zero hours in the period** — the ranking omits them, but "Minhas horas" and the home card still render (0h + empty chart message), never a crash on `pessoas[0]`. Pinned in Task 2 (`agregarHoras` returns one entry per requested `userId`) and handled in Tasks 7–8.

---

## File map

| File | Responsibility |
|---|---|
| Create `src/modules/rh/produtividade/periodo.ts` (+ `.test.ts`) | Period shortcuts, URL parsing, list of days, weekly buckets |
| Create `src/modules/rh/produtividade/horas.ts` (+ `.test.ts`) | Aggregate sessions → hours per person/day/destination; stacked series |
| Create `src/modules/rh/produtividade/acoes-horas.ts` (+ `.test.ts`) | Context-menu descriptor for a ranking row |
| Modify `src/modules/rh/produtividade/queries.ts` | Replace `horasDiariasProjetistas` with `horasProjetistas(periodo, opcoes)` |
| Modify `src/lib/permissions-catalog.ts`, `src/lib/permissions-catalog.test.ts` | New pair `rh:produtividade` |
| Modify `prisma/seed.ts` | `PERMISSOES_BASE` rows for supervisor + administrativo |
| Create `prisma/migrations/20261007170000_perfis_rh_produtividade/migration.sql` | Grant the pair to existing profiles + legacy table |
| Modify `src/lib/nav-config.ts` | Produtividade item gated by `rh:produtividade` |
| Modify `src/app/(dashboard)/rh/produtividade/page.tsx`, `src/app/api/rh/produtividade/export/route.ts` | New gate + period |
| Create `src/components/rh/horas/formato.ts` | Labels and color tokens (pure) |
| Create `src/components/rh/horas/seletor-periodo.tsx` | Shortcut buttons + free range |
| Create `src/components/rh/horas/grafico-horas.tsx` | SVG lines or stacked bars + table with the same numbers |
| Create `src/components/rh/horas/ranking-horas.tsx` | Ranking bars, selection, context menu |
| Create `src/components/rh/horas/painel-horas-equipe.tsx` | RH block: period + ranking + chart |
| Modify `src/components/rh/produtividade-view.tsx`; delete `src/components/rh/horas-diarias-chart.tsx` | Swap the old card for the new block |
| Create `src/app/(dashboard)/ponto/horas/page.tsx`, `src/components/ponto/minhas-horas-view.tsx` | "Minhas horas" tab |
| Modify `src/components/ponto/ponto-subnav.tsx` | Third tab |
| Modify `src/app/(dashboard)/page.tsx` | Home card "Minhas horas · 14 dias" |
| Modify `docs/manual/rh-ponto/produtividade.md`, `docs/manual/rh-ponto/ponto.md` | User manual |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch from `dev-vscode`, carrying the spec and this plan**

The spec and plan are untracked files in the working tree, so they survive the checkout.

```bash
git fetch origin
git switch -c feat/horas-graficos origin/dev-vscode
git add docs/superpowers/specs/2026-10-07-horas-projetistas-graficos-design.md docs/superpowers/plans/2026-10-07-horas-projetistas-graficos.md
git commit -m "docs(rh): spec e plano das horas dos projetistas em gráficos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

Expected: 2 files in the commit. If `git switch` refuses because of local changes in tracked files (`.gitignore` is modified), stop and ask the owner. Do not stash.

---

### Task 1: Period rules (`periodo.ts`)

**Files:**
- Create: `src/modules/rh/produtividade/periodo.ts`
- Test: `src/modules/rh/produtividade/periodo.test.ts`

**Interfaces:**
- Produces:
  - `LIMITE_DIARIO = 92`
  - `type AtalhoPeriodo = "7d" | "14d" | "30d" | "mes_atual" | "mes_anterior"`
  - `ATALHOS: readonly { id: AtalhoPeriodo; rotulo: string }[]`
  - `type Granularidade = "dia" | "semana"`
  - `type Periodo = { de: string; ate: string; atalho: AtalhoPeriodo | null; granularidade: Granularidade }`
  - `somarDias(dia: string, n: number): string`
  - `listarDias(de: string, ate: string): string[]`
  - `intervaloDoAtalho(atalho: AtalhoPeriodo, hoje: string): { de: string; ate: string }`
  - `resolverPeriodo(params: { de?: string; ate?: string }, hoje: string): Periodo`
  - `type Bucket = { inicio: string; fim: string; indices: number[] }`
  - `bucketsDoPeriodo(dias: string[], granularidade: Granularidade): Bucket[]`

Note: `queries.ts` already exports a different `Granularidade` (`"semana" | "mes"`) for the productivity table. Do not import both under the same name. Import this one as `type Granularidade as GranularidadeHoras` where they meet.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/rh/produtividade/periodo.test.ts
import { describe, expect, it } from "vitest";
import {
  ATALHOS,
  bucketsDoPeriodo,
  intervaloDoAtalho,
  LIMITE_DIARIO,
  listarDias,
  resolverPeriodo,
  somarDias,
} from "./periodo";

const HOJE = "2026-10-07"; // quarta-feira

describe("somarDias / listarDias", () => {
  it("atravessa virada de mês e de ano", () => {
    expect(somarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("lista o intervalo inclusive nas duas pontas", () => {
    expect(listarDias("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
  it("um dia só", () => {
    expect(listarDias(HOJE, HOJE)).toEqual([HOJE]);
  });
});

describe("intervaloDoAtalho", () => {
  it("N dias terminam hoje e contam hoje", () => {
    expect(intervaloDoAtalho("7d", HOJE)).toEqual({ de: "2026-10-01", ate: HOJE });
    expect(intervaloDoAtalho("14d", HOJE)).toEqual({ de: "2026-09-24", ate: HOJE });
    expect(intervaloDoAtalho("30d", HOJE)).toEqual({ de: "2026-09-08", ate: HOJE });
  });
  it("mês atual vai do dia 1 até hoje", () => {
    expect(intervaloDoAtalho("mes_atual", HOJE)).toEqual({ de: "2026-10-01", ate: HOJE });
  });
  it("mês anterior é o mês fechado, inclusive em janeiro", () => {
    expect(intervaloDoAtalho("mes_anterior", HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(intervaloDoAtalho("mes_anterior", "2026-01-15")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(intervaloDoAtalho("mes_anterior", "2026-03-10")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
  });
  it("todo atalho tem rótulo", () => {
    expect(ATALHOS.map((a) => a.id)).toEqual(["7d", "14d", "30d", "mes_atual", "mes_anterior"]);
  });
});

describe("resolverPeriodo", () => {
  it("sem parâmetro = últimos 14 dias, diário", () => {
    expect(resolverPeriodo({}, HOJE)).toEqual({ de: "2026-09-24", ate: HOJE, atalho: "14d", granularidade: "dia" });
  });
  it("intervalo livre válido é respeitado e reconhece o atalho equivalente", () => {
    expect(resolverPeriodo({ de: "2026-09-01", ate: "2026-09-30" }, HOJE)).toEqual({
      de: "2026-09-01",
      ate: "2026-09-30",
      atalho: "mes_anterior",
      granularidade: "dia",
    });
    expect(resolverPeriodo({ de: "2026-09-10", ate: "2026-09-20" }, HOJE).atalho).toBeNull();
  });
  it("ate no futuro é cortado em hoje", () => {
    expect(resolverPeriodo({ de: "2026-10-01", ate: "2026-12-31" }, HOJE)).toMatchObject({ de: "2026-10-01", ate: HOJE });
  });
  it.each([
    [{ de: "abc", ate: HOJE }],
    [{ de: "2026-02-30", ate: "2026-03-05" }],
    [{ de: "2026-10-05", ate: "2026-10-01" }],
    [{ de: "2026-11-01", ate: "2026-11-30" }],
    [{ de: "2026-10-01" }],
  ])("parâmetro inválido cai no padrão (%o)", (params) => {
    expect(resolverPeriodo(params, HOJE)).toMatchObject({ de: "2026-09-24", ate: HOJE, atalho: "14d" });
  });
  it(`até ${LIMITE_DIARIO} dias é diário; acima agrupa por semana`, () => {
    const de92 = somarDias(HOJE, -(LIMITE_DIARIO - 1));
    expect(resolverPeriodo({ de: de92, ate: HOJE }, HOJE).granularidade).toBe("dia");
    const de93 = somarDias(HOJE, -LIMITE_DIARIO);
    expect(resolverPeriodo({ de: de93, ate: HOJE }, HOJE).granularidade).toBe("semana");
  });
});

describe("bucketsDoPeriodo", () => {
  it("diário = um bucket por dia", () => {
    const dias = listarDias("2026-10-05", "2026-10-07");
    expect(bucketsDoPeriodo(dias, "dia")).toEqual([
      { inicio: "2026-10-05", fim: "2026-10-05", indices: [0] },
      { inicio: "2026-10-06", fim: "2026-10-06", indices: [1] },
      { inicio: "2026-10-07", fim: "2026-10-07", indices: [2] },
    ]);
  });
  it("semanal começa no 1º dia do período (quarta) e quebra na segunda seguinte", () => {
    // 2026-09-30 é quarta; 2026-10-05 é segunda.
    const dias = listarDias("2026-09-30", "2026-10-13");
    const b = bucketsDoPeriodo(dias, "semana");
    expect(b.map((x) => [x.inicio, x.fim])).toEqual([
      ["2026-09-30", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-13"],
    ]);
    // nenhum dia perdido nem repetido
    expect(b.flatMap((x) => x.indices)).toEqual(dias.map((_, i) => i));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/rh/produtividade/periodo.test.ts`
Expected: FAIL — `Failed to resolve import "./periodo"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/rh/produtividade/periodo.ts
/**
 * Período das telas de horas (RH → Produtividade, Ponto → Minhas horas, card do Início) — **puro**,
 * importado por componentes de cliente: nada de Prisma, server-only ou Next aqui.
 *
 * Dia = `YYYY-MM-DD` no calendário de Brasília (quem chama passa `hoje` = `diaLocal(new Date())`).
 * Sem teto de período (decisão do dono, 2026-10-07): acima de `LIMITE_DIARIO` dias o gráfico deixa de
 * ser dia a dia e agrupa por semana, porque ~7 px por barra já é o limite de leitura.
 */

export const LIMITE_DIARIO = 92;

export type AtalhoPeriodo = "7d" | "14d" | "30d" | "mes_atual" | "mes_anterior";

export const ATALHOS: readonly { id: AtalhoPeriodo; rotulo: string }[] = [
  { id: "7d", rotulo: "7 dias" },
  { id: "14d", rotulo: "14 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes_atual", rotulo: "Mês atual" },
  { id: "mes_anterior", rotulo: "Mês anterior" },
];

export type Granularidade = "dia" | "semana";

export type Periodo = { de: string; ate: string; atalho: AtalhoPeriodo | null; granularidade: Granularidade };

export type Bucket = { inicio: string; fim: string; indices: number[] };

const PADRAO: AtalhoPeriodo = "14d";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function paraUtc(dia: string): Date {
  return new Date(`${dia}T00:00:00Z`);
}

function diaValido(dia: string | undefined): dia is string {
  if (!dia || !ISO.test(dia)) return false;
  const d = paraUtc(dia);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

export function somarDias(dia: string, n: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + n)).toISOString().slice(0, 10);
}

export function listarDias(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

export function intervaloDoAtalho(atalho: AtalhoPeriodo, hoje: string): { de: string; ate: string } {
  switch (atalho) {
    case "7d":
      return { de: somarDias(hoje, -6), ate: hoje };
    case "14d":
      return { de: somarDias(hoje, -13), ate: hoje };
    case "30d":
      return { de: somarDias(hoje, -29), ate: hoje };
    case "mes_atual":
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case "mes_anterior": {
      const [ano, mes] = hoje.split("-").map(Number);
      const de = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10);
      const ate = new Date(Date.UTC(ano, mes - 1, 0)).toISOString().slice(0, 10);
      return { de, ate };
    }
  }
}

/** Lê `?de=&ate=`. Qualquer coisa inválida (data impossível, de > ate, de no futuro) volta ao padrão. */
export function resolverPeriodo(params: { de?: string; ate?: string }, hoje: string): Periodo {
  let { de, ate } = intervaloDoAtalho(PADRAO, hoje);
  if (diaValido(params.de) && diaValido(params.ate) && params.de <= params.ate && params.de <= hoje) {
    de = params.de;
    ate = params.ate > hoje ? hoje : params.ate;
  }
  const atalho =
    ATALHOS.find((a) => {
      const i = intervaloDoAtalho(a.id, hoje);
      return i.de === de && i.ate === ate;
    })?.id ?? null;
  const qtdDias = Math.round((paraUtc(ate).getTime() - paraUtc(de).getTime()) / 86_400_000) + 1;
  return { de, ate, atalho, granularidade: qtdDias > LIMITE_DIARIO ? "semana" : "dia" };
}

/**
 * Agrupa os índices de `dias` para o gráfico. Semanal quebra na segunda-feira, mas o 1º bucket
 * começa no 1º dia do período (nunca numa segunda fora do intervalo pedido).
 */
export function bucketsDoPeriodo(dias: string[], granularidade: Granularidade): Bucket[] {
  if (granularidade === "dia") return dias.map((dia, i) => ({ inicio: dia, fim: dia, indices: [i] }));
  const buckets: Bucket[] = [];
  dias.forEach((dia, i) => {
    const ehSegunda = paraUtc(dia).getUTCDay() === 1;
    const atual = buckets[buckets.length - 1];
    if (!atual || ehSegunda) buckets.push({ inicio: dia, fim: dia, indices: [i] });
    else {
      atual.fim = dia;
      atual.indices.push(i);
    }
  });
  return buckets;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/rh/produtividade/periodo.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/rh/produtividade/periodo.ts src/modules/rh/produtividade/periodo.test.ts
git commit -m "feat(rh): período livre das horas — atalhos, leitura da URL e agrupamento semanal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 2: Hours aggregation (`horas.ts`)

**Files:**
- Create: `src/modules/rh/produtividade/horas.ts`
- Test: `src/modules/rh/produtividade/horas.test.ts`

**Interfaces:**
- Consumes: `listarDias`, `Bucket` from `./periodo` (Task 1); `minutosPorDiaSessao` from `@/modules/ponto/engine`; `type TipoAlocacaoPonto` from `@/modules/ponto/alocacao`.
- Produces:
  - `type SessaoHoras = { userId: string; inicio: Date; fim: Date | null; tipoAlocacao: TipoAlocacaoPonto; projeto: { id: string; codigo: string; nome: string } | null }`
  - `DESTINO_REUNIOES = "reunioes"`, `DESTINO_SEM_PROJETO = "sem_projeto"`, `DESTINO_OUTROS = "outros"`
  - `chaveDestino(s: Pick<SessaoHoras, "tipoAlocacao" | "projeto">): string` — `"p:<projetoId>"` | `"reunioes"` | `"sem_projeto"`
  - `type HorasPessoa = { userId: string; totalHoras: number; diasComRegistro: number; mediaPorDiaComRegistro: number; porDia: number[]; porDestino: Record<string, number[]> }` — `porDia` and every `porDestino[k]` are aligned with `dias`, in hours with 1 decimal.
  - `type HorasDoPeriodo = { dias: string[]; destinos: Record<string, string>; pessoas: HorasPessoa[] }` — `destinos` maps key → label.
  - `agregarHoras(sessoes: SessaoHoras[], opts: { de: string; ate: string; agora: Date; userIds: string[] }): HorasDoPeriodo` — exactly one `HorasPessoa` per `userIds` entry, in that order.
  - `type SerieHoras = { chave: string; rotulo: string; valores: number[] }`
  - `empilharPorDestino(pessoa: HorasPessoa, destinos: Record<string, string>, n?: number): SerieHoras[]`
  - `somarPorBucket(valores: number[], buckets: Bucket[]): number[]`

Design note (spec §1): internal and external meetings are merged at aggregation time into one `reunioes` key. The screen only ever shows them together, and the merge keeps the payload smaller.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/rh/produtividade/horas.test.ts
import { describe, expect, it } from "vitest";
import {
  agregarHoras,
  chaveDestino,
  DESTINO_OUTROS,
  DESTINO_REUNIOES,
  DESTINO_SEM_PROJETO,
  empilharPorDestino,
  somarPorBucket,
  type SessaoHoras,
} from "./horas";
import { bucketsDoPeriodo, listarDias } from "./periodo";

// Horários em -03:00 (Brasília) para o dia local ficar óbvio no teste.
const t = (s: string) => new Date(`${s}-03:00`);
const AGORA = t("2026-10-07T15:00:00");
const proj = (n: number) => ({ id: `p${n}`, codigo: `26000${n}`, nome: `Projeto ${n}` });

function sessao(over: Partial<SessaoHoras>): SessaoHoras {
  return {
    userId: "u1",
    inicio: t("2026-10-06T08:00:00"),
    fim: t("2026-10-06T12:00:00"),
    tipoAlocacao: "projeto",
    projeto: proj(1),
    ...over,
  };
}

const PERIODO = { de: "2026-10-05", ate: "2026-10-07", agora: AGORA };

describe("chaveDestino", () => {
  it("projeto, reunião (interna e externa juntas) e sem projeto", () => {
    expect(chaveDestino({ tipoAlocacao: "projeto", projeto: proj(1) })).toBe("p:p1");
    expect(chaveDestino({ tipoAlocacao: "reuniao_interna", projeto: null })).toBe(DESTINO_REUNIOES);
    expect(chaveDestino({ tipoAlocacao: "reuniao_externa", projeto: null })).toBe(DESTINO_REUNIOES);
    expect(chaveDestino({ tipoAlocacao: "sem_projeto", projeto: null })).toBe(DESTINO_SEM_PROJETO);
  });
  it("tipo projeto sem projeto (dado ruim) conta como sem projeto, nunca some", () => {
    expect(chaveDestino({ tipoAlocacao: "projeto", projeto: null })).toBe(DESTINO_SEM_PROJETO);
  });
});

describe("agregarHoras", () => {
  it("uma entrada por userId pedido, na ordem pedida, mesmo sem horas", () => {
    const r = agregarHoras([sessao({})], { ...PERIODO, userIds: ["u2", "u1"] });
    expect(r.dias).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(r.pessoas.map((p) => p.userId)).toEqual(["u2", "u1"]);
    expect(r.pessoas[0]).toMatchObject({ totalHoras: 0, diasComRegistro: 0, mediaPorDiaComRegistro: 0, porDia: [0, 0, 0] });
  });

  it("soma por dia e por destino, com rótulo do projeto", () => {
    const r = agregarHoras(
      [
        sessao({}),
        sessao({ inicio: t("2026-10-06T13:00:00"), fim: t("2026-10-06T14:30:00"), tipoAlocacao: "reuniao_externa", projeto: null }),
      ],
      { ...PERIODO, userIds: ["u1"] },
    );
    const p = r.pessoas[0];
    expect(p.porDia).toEqual([0, 5.5, 0]);
    expect(p.porDestino["p:p1"]).toEqual([0, 4, 0]);
    expect(p.porDestino[DESTINO_REUNIOES]).toEqual([0, 1.5, 0]);
    expect(r.destinos["p:p1"]).toBe("260001 · Projeto 1");
    expect(r.destinos[DESTINO_REUNIOES]).toBe("Reuniões");
    expect(p).toMatchObject({ totalHoras: 5.5, diasComRegistro: 1, mediaPorDiaComRegistro: 5.5 });
  });

  it("sessão que cruza a meia-noite reparte entre os dois dias", () => {
    const r = agregarHoras([sessao({ inicio: t("2026-10-05T22:00:00"), fim: t("2026-10-06T01:00:00") })], {
      ...PERIODO,
      userIds: ["u1"],
    });
    expect(r.pessoas[0].porDia).toEqual([2, 1, 0]);
    expect(r.pessoas[0].diasComRegistro).toBe(2);
    expect(r.pessoas[0].mediaPorDiaComRegistro).toBe(1.5);
  });

  it("sessão aberta conta até agora, nunca no futuro", () => {
    const r = agregarHoras([sessao({ inicio: t("2026-10-07T13:00:00"), fim: null })], { ...PERIODO, userIds: ["u1"] });
    expect(r.pessoas[0].porDia).toEqual([0, 0, 2]);
  });

  it("descarta o que cai fora do período", () => {
    const r = agregarHoras([sessao({ inicio: t("2026-10-04T23:00:00"), fim: t("2026-10-05T01:00:00") })], {
      ...PERIODO,
      userIds: ["u1"],
    });
    expect(r.pessoas[0].porDia).toEqual([1, 0, 0]);
    expect(r.pessoas[0].totalHoras).toBe(1);
  });

  it("ignora sessão de quem não foi pedido", () => {
    const r = agregarHoras([sessao({ userId: "intruso" })], { ...PERIODO, userIds: ["u1"] });
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0].totalHoras).toBe(0);
  });

  it("arredonda só na borda: 3 × 20 min = 1h, não 0,9h", () => {
    const r = agregarHoras(
      [8, 9, 10].map((h) => {
        const hh = String(h).padStart(2, "0");
        return sessao({ inicio: t(`2026-10-06T${hh}:00:00`), fim: t(`2026-10-06T${hh}:20:00`) });
      }),
      { ...PERIODO, userIds: ["u1"] },
    );
    expect(r.pessoas[0].totalHoras).toBe(1);
    expect(r.pessoas[0].porDia[1]).toBe(1);
  });
});

describe("empilharPorDestino", () => {
  it("top 5 projetos + Outros + Reuniões + Sem projeto, só o que tem horas", () => {
    const sessoes: SessaoHoras[] = [];
    // 7 projetos com 7h, 6h, … 1h no mesmo dia
    for (let n = 1; n <= 7; n++) {
      sessoes.push(sessao({ projeto: proj(n), inicio: t("2026-10-06T00:00:00"), fim: new Date(t("2026-10-06T00:00:00").getTime() + (8 - n) * 3_600_000) }));
    }
    sessoes.push(sessao({ tipoAlocacao: "sem_projeto", projeto: null, inicio: t("2026-10-07T08:00:00"), fim: t("2026-10-07T09:00:00") }));
    const r = agregarHoras(sessoes, { ...PERIODO, userIds: ["u1"] });
    const series = empilharPorDestino(r.pessoas[0], r.destinos);
    expect(series.map((s) => s.chave)).toEqual(["p:p1", "p:p2", "p:p3", "p:p4", "p:p5", DESTINO_OUTROS, DESTINO_SEM_PROJETO]);
    expect(series.find((s) => s.chave === DESTINO_OUTROS)).toMatchObject({ rotulo: "Outros projetos", valores: [0, 3, 0] });
    // a pilha soma o total do dia
    const somaDia1 = series.reduce((s, x) => s + x.valores[1], 0);
    expect(somaDia1).toBeCloseTo(r.pessoas[0].porDia[1], 5);
  });
});

describe("somarPorBucket", () => {
  it("soma por semana sem perder hora", () => {
    const dias = listarDias("2026-09-30", "2026-10-06"); // qua → ter
    const valores = [1, 1, 1, 1, 1, 2, 2.5];
    const buckets = bucketsDoPeriodo(dias, "semana");
    expect(somarPorBucket(valores, buckets)).toEqual([5, 4.5]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/rh/produtividade/horas.test.ts`
Expected: FAIL — `Failed to resolve import "./horas"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/rh/produtividade/horas.ts
import { minutosPorDiaSessao } from "@/modules/ponto/engine";
import type { TipoAlocacaoPonto } from "@/modules/ponto/alocacao";
import { listarDias, type Bucket } from "./periodo";

/**
 * Horas por pessoa, por dia e por destino — **puro** (cliente e servidor). É a regra única das telas
 * de horas: RH → Produtividade, Ponto → Minhas horas e o card do Início leem daqui, então uma pessoa
 * num dia nunca mostra dois números.
 *
 * Soma em MINUTOS e só converte para horas (1 casa) na saída. A divisão da sessão pelos dias é a do
 * ponto (`minutosPorDiaSessao`): cruza a meia-noite repartindo, e sessão aberta conta até `agora`.
 */

export type SessaoHoras = {
  userId: string;
  inicio: Date;
  fim: Date | null;
  tipoAlocacao: TipoAlocacaoPonto;
  projeto: { id: string; codigo: string; nome: string } | null;
};

export const DESTINO_REUNIOES = "reunioes";
export const DESTINO_SEM_PROJETO = "sem_projeto";
export const DESTINO_OUTROS = "outros";

const ROTULOS_FIXOS: Record<string, string> = {
  [DESTINO_REUNIOES]: "Reuniões",
  [DESTINO_SEM_PROJETO]: "Sem projeto",
  [DESTINO_OUTROS]: "Outros projetos",
};

export type HorasPessoa = {
  userId: string;
  totalHoras: number;
  diasComRegistro: number;
  mediaPorDiaComRegistro: number;
  /** Alinhado a `dias`. */
  porDia: number[];
  /** Chave do destino → horas alinhadas a `dias`. */
  porDestino: Record<string, number[]>;
};

export type HorasDoPeriodo = { dias: string[]; destinos: Record<string, string>; pessoas: HorasPessoa[] };

export type SerieHoras = { chave: string; rotulo: string; valores: number[] };

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const horas = (minutos: number) => umaCasa(minutos / 60);

export function chaveDestino(s: Pick<SessaoHoras, "tipoAlocacao" | "projeto">): string {
  if (s.tipoAlocacao === "projeto" && s.projeto) return `p:${s.projeto.id}`;
  if (s.tipoAlocacao === "reuniao_interna" || s.tipoAlocacao === "reuniao_externa") return DESTINO_REUNIOES;
  return DESTINO_SEM_PROJETO;
}

export function agregarHoras(
  sessoes: SessaoHoras[],
  { de, ate, agora, userIds }: { de: string; ate: string; agora: Date; userIds: string[] },
): HorasDoPeriodo {
  const dias = listarDias(de, ate);
  const indiceDoDia = new Map(dias.map((d, i) => [d, i]));
  const destinos: Record<string, string> = {};
  // userId → destino → minutos por índice de dia
  const minutos = new Map<string, Map<string, number[]>>(userIds.map((id) => [id, new Map()]));

  for (const s of sessoes) {
    const porDestino = minutos.get(s.userId);
    if (!porDestino) continue;
    const chave = chaveDestino(s);
    for (const [dia, min] of minutosPorDiaSessao(s.inicio, s.fim, agora)) {
      const i = indiceDoDia.get(dia);
      if (i === undefined || min <= 0) continue;
      let serie = porDestino.get(chave);
      if (!serie) {
        serie = new Array<number>(dias.length).fill(0);
        porDestino.set(chave, serie);
        destinos[chave] ??= s.projeto && chave.startsWith("p:") ? `${s.projeto.codigo} · ${s.projeto.nome}` : ROTULOS_FIXOS[chave];
      }
      serie[i] += min;
    }
  }

  const pessoas = userIds.map((userId): HorasPessoa => {
    const porDestinoMin = minutos.get(userId)!;
    const porDiaMin = new Array<number>(dias.length).fill(0);
    const porDestino: Record<string, number[]> = {};
    for (const [chave, serie] of porDestinoMin) {
      serie.forEach((m, i) => (porDiaMin[i] += m));
      porDestino[chave] = serie.map(horas);
    }
    const totalMin = porDiaMin.reduce((s, m) => s + m, 0);
    const diasComRegistro = porDiaMin.filter((m) => m > 0).length;
    return {
      userId,
      totalHoras: horas(totalMin),
      diasComRegistro,
      mediaPorDiaComRegistro: diasComRegistro === 0 ? 0 : horas(totalMin / diasComRegistro),
      porDia: porDiaMin.map(horas),
      porDestino,
    };
  });

  return { dias, destinos, pessoas };
}

/** Barras empilhadas de UMA pessoa: os `n` maiores projetos, depois Outros, Reuniões e Sem projeto. */
export function empilharPorDestino(pessoa: HorasPessoa, destinos: Record<string, string>, n = 5): SerieHoras[] {
  const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const projetos = Object.entries(pessoa.porDestino)
    .filter(([chave, v]) => chave.startsWith("p:") && soma(v) > 0)
    .sort((a, b) => soma(b[1]) - soma(a[1]) || (destinos[a[0]] ?? "").localeCompare(destinos[b[0]] ?? ""));

  const series: SerieHoras[] = projetos
    .slice(0, n)
    .map(([chave, valores]) => ({ chave, rotulo: destinos[chave] ?? chave, valores }));

  const resto = projetos.slice(n);
  if (resto.length > 0) {
    const valores = pessoa.porDia.map((_, i) => umaCasa(resto.reduce((s, [, v]) => s + v[i], 0)));
    series.push({ chave: DESTINO_OUTROS, rotulo: ROTULOS_FIXOS[DESTINO_OUTROS], valores });
  }
  for (const chave of [DESTINO_REUNIOES, DESTINO_SEM_PROJETO]) {
    const valores = pessoa.porDestino[chave];
    if (valores && soma(valores) > 0) series.push({ chave, rotulo: ROTULOS_FIXOS[chave], valores });
  }
  return series;
}

export function somarPorBucket(valores: number[], buckets: Bucket[]): number[] {
  return buckets.map((b) => umaCasa(b.indices.reduce((s, i) => s + (valores[i] ?? 0), 0)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/rh/produtividade/horas.test.ts src/modules/rh/produtividade/periodo.test.ts`
Expected: PASS. If the "Outros" value check fails by float noise, the test's expected value is wrong only when the inputs are not whole hours. They are whole here (p6 = 2h, p7 = 1h → 3h), so fix the implementation instead.

- [ ] **Step 5: Commit**

```bash
git add src/modules/rh/produtividade/horas.ts src/modules/rh/produtividade/horas.test.ts
git commit -m "feat(rh): agregação única das horas por pessoa, dia e projeto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 3: Ranking row actions (`acoes-horas.ts`)

**Files:**
- Create: `src/modules/rh/produtividade/acoes-horas.ts`
- Test: `src/modules/rh/produtividade/acoes-horas.test.ts`

**Interfaces:**
- Consumes: `type AcaoItem` from `@/components/ui/acoes`.
- Produces:
  - `LIMITE_COMPARACAO = 5`, `MOTIVO_LIMITE_COMPARACAO = "Compare no máximo 5 projetistas."`
  - `ACAO_COMPARAR = "comparar"`, `ACAO_TIRAR = "tirar"`, `ACAO_POR_PROJETO = "por-projeto"`, `ACAO_ESPELHO = "espelho"`
  - `itensDoRankingDeHoras(p: { userId: string; selecionado: boolean; totalSelecionados: number; podeVerEspelho: boolean }): AcaoItem[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/rh/produtividade/acoes-horas.test.ts
import { describe, expect, it } from "vitest";
import {
  ACAO_COMPARAR,
  ACAO_ESPELHO,
  ACAO_POR_PROJETO,
  ACAO_TIRAR,
  itensDoRankingDeHoras,
  LIMITE_COMPARACAO,
  MOTIVO_LIMITE_COMPARACAO,
} from "./acoes-horas";

const base = { userId: "u 1", selecionado: false, totalSelecionados: 0, podeVerEspelho: true };
const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("itensDoRankingDeHoras", () => {
  it("não selecionado: Comparar, Ver por projeto, Espelho", () => {
    expect(ids(itensDoRankingDeHoras(base))).toEqual([ACAO_COMPARAR, ACAO_POR_PROJETO, ACAO_ESPELHO]);
  });
  it("selecionado troca Comparar por Tirar da comparação", () => {
    expect(ids(itensDoRankingDeHoras({ ...base, selecionado: true, totalSelecionados: 1 }))[0]).toBe(ACAO_TIRAR);
  });
  it(`no limite de ${LIMITE_COMPARACAO}, Comparar fica desabilitado com o motivo`, () => {
    const item = itensDoRankingDeHoras({ ...base, totalSelecionados: LIMITE_COMPARACAO })[0];
    expect(item).toMatchObject({ id: ACAO_COMPARAR, desabilitado: MOTIVO_LIMITE_COMPARACAO });
  });
  it("Tirar nunca é bloqueado pelo limite", () => {
    const item = itensDoRankingDeHoras({ ...base, selecionado: true, totalSelecionados: LIMITE_COMPARACAO })[0];
    expect(item).toMatchObject({ id: ACAO_TIRAR });
    expect("desabilitado" in item && item.desabilitado).toBeFalsy();
  });
  it("sem ponto:espelho_equipe o item do espelho é omitido (não desabilitado)", () => {
    expect(ids(itensDoRankingDeHoras({ ...base, podeVerEspelho: false }))).not.toContain(ACAO_ESPELHO);
  });
  it("espelho é link com o usuário codificado", () => {
    const item = itensDoRankingDeHoras(base).find((i) => i.id === ACAO_ESPELHO);
    expect(item).toMatchObject({ tipo: "link", href: "/ponto/espelho?u=u%201" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/rh/produtividade/acoes-horas.test.ts`
Expected: FAIL — cannot resolve `./acoes-horas`.

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/rh/produtividade/acoes-horas.ts
import { CalendarClock, ChartColumnStacked, GitCompare, X } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha do ranking de horas — **puro** (ADR-0002). O mesmo array vai para o menu de
 * contexto e para o `...`. Perfil sem `ponto:espelho_equipe` não recebe o item do espelho (omitido);
 * o limite de comparação é estado, então o item aparece desabilitado com o motivo.
 */

export const LIMITE_COMPARACAO = 5;
export const MOTIVO_LIMITE_COMPARACAO = "Compare no máximo 5 projetistas.";

export const ACAO_COMPARAR = "comparar";
export const ACAO_TIRAR = "tirar";
export const ACAO_POR_PROJETO = "por-projeto";
export const ACAO_ESPELHO = "espelho";

export function itensDoRankingDeHoras(p: {
  userId: string;
  selecionado: boolean;
  totalSelecionados: number;
  podeVerEspelho: boolean;
}): AcaoItem[] {
  const itens: AcaoItem[] = [
    p.selecionado
      ? { tipo: "acao", id: ACAO_TIRAR, rotulo: "Tirar da comparação", icone: X }
      : {
          tipo: "acao",
          id: ACAO_COMPARAR,
          rotulo: "Comparar",
          icone: GitCompare,
          desabilitado: p.totalSelecionados >= LIMITE_COMPARACAO ? MOTIVO_LIMITE_COMPARACAO : undefined,
        },
    { tipo: "acao", id: ACAO_POR_PROJETO, rotulo: "Ver por projeto", icone: ChartColumnStacked },
  ];
  if (p.podeVerEspelho) {
    itens.push({
      tipo: "link",
      id: ACAO_ESPELHO,
      rotulo: "Abrir espelho de ponto",
      icone: CalendarClock,
      href: `/ponto/espelho?u=${encodeURIComponent(p.userId)}`,
    });
  }
  return itens;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/rh/produtividade/acoes-horas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/rh/produtividade/acoes-horas.ts src/modules/rh/produtividade/acoes-horas.test.ts
git commit -m "feat(rh): ações da linha do ranking de horas (comparar, por projeto, espelho)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 4: Permission `rh:produtividade`

**Files:**
- Modify: `src/lib/permissions-catalog.ts` (the `recurso: "rh"` block, ~line 421)
- Modify: `src/lib/permissions-catalog.test.ts`
- Modify: `prisma/seed.ts` (`PERMISSOES_BASE`, near line 131 `rh:cadastro`)
- Create: `prisma/migrations/20261007170000_perfis_rh_produtividade/migration.sql`
- Modify: `src/lib/nav-config.ts` (item `href: "/rh/produtividade"`, ~line 288)
- Modify: `src/app/(dashboard)/rh/produtividade/page.tsx` (gate only in this task)
- Modify: `src/app/api/rh/produtividade/export/route.ts`

**Interfaces:**
- Produces: the pair `rh:produtividade`, checked with `requirePermission("rh", "produtividade")` (server pages/routes) and `can(user, "rh", "produtividade")`.

- [ ] **Step 1: Write the failing test** (append inside `src/lib/permissions-catalog.test.ts`, at the end of the file)

```ts
describe("rh:produtividade", () => {
  it("é leitura e abre a tela Produtividade", () => {
    expect(ehLeitura("rh", "produtividade")).toBe(true);
    expect(telaQueAbre("rh", "produtividade")).toBe("Produtividade");
  });
  it("rh:cadastro não reivindica mais a tela Produtividade", () => {
    expect(telaQueAbre("rh", "cadastro")).not.toContain("Produtividade");
  });
  it("o menu de Produtividade exige rh:produtividade", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/rh/produtividade");
    expect(item?.permissao).toBe("rh:produtividade");
  });
});
```

Before writing, read `telaQueAbre` in `permissions-catalog.ts` to confirm it returns the `abre` string (or `null`). If it returns another shape, adapt the two `telaQueAbre` assertions to it, keeping the meaning.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/permissions-catalog.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Catalog — edit the `rh` block**

Replace:

```ts
      { acao: "cadastro", label: "Ver a ficha de pessoas (cadastro, ausências, escala)", abre: "Pessoas · RH — admin · Produtividade · Pessoas Jurídicas", leitura: true },
```

with:

```ts
      { acao: "cadastro", label: "Ver a ficha de pessoas (cadastro, ausências, escala)", abre: "Pessoas · RH — admin · Pessoas Jurídicas", leitura: true },
      // 2026-10-07: a tela era `requireRole(HR_ADMIN_ROLES)` e o menu pedia `rh:cadastro` — que o
      // coordenador não tem, então a página abria para ele mas o item sumia. Par próprio resolve os dois.
      { acao: "produtividade", label: "Ver horas e produtividade dos projetistas", abre: "Produtividade", leitura: true },
```

- [ ] **Step 4: Nav — edit the Produtividade item in `src/lib/nav-config.ts`**

```ts
      {
        title: "Produtividade",
        href: "/rh/produtividade",
        icon: TrendingUp,
        permissao: "rh:produtividade",
      },
```

- [ ] **Step 5: Seed — add to `PERMISSOES_BASE` in `prisma/seed.ts`, right after the `rh:catalogos` line**

```ts
  // Horas e produtividade dos projetistas (2026-10-07): espelha o gate antigo `HR_ADMIN_ROLES`.
  { role: "supervisor", recurso: "rh", acao: "produtividade" },
  { role: "administrativo", recurso: "rh", acao: "produtividade" },
```

- [ ] **Step 6: Data migration**

```sql
-- prisma/migrations/20261007170000_perfis_rh_produtividade/migration.sql
-- Concede `rh:produtividade` a quem já abria RH → Produtividade.
--
-- POR QUE UMA MIGRATION: `seedPerfisAcesso` é create-only desde 2026-09-02 e não distribui par
-- novo a perfil existente. Modelo: `20260902120000_perfis_tarefas_ver`.
--
-- POR QUE ESTES PERFIS (nomeados, sem derivar): o gate antigo era o PAPEL — `requireRole(HR_ADMIN_ROLES)`
-- = admin + supervisor + administrativo. Admin é `superUsuario` (bypass, sem perfil); os perfis que
-- espelham os outros dois são `coordenador` e `administrativo`. Derivar de `rh:cadastro` deixaria o
-- coordenador de fora (ele nunca teve `rh:cadastro`) — perda silenciosa de uma tela que ele usa.
--
-- Idempotente por `ON CONFLICT ... DO NOTHING`: reexecutar não duplica nem desfaz revogação feita na tela.

INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'rh', 'produtividade', true
FROM "perfil_acesso" p
WHERE p."chave" IN ('coordenador', 'administrativo')
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;

-- Tabela legada `permissao`: o piso de sócio de `requirePermission` consulta
-- `canRole("supervisor", …)` nela. Sem esta linha, o sócio perderia a tela até o próximo `db:seed`.
INSERT INTO "permissao" ("id", "role", "recurso", "acao", "permitido")
VALUES
  (gen_random_uuid()::text, 'supervisor', 'rh', 'produtividade', true),
  (gen_random_uuid()::text, 'administrativo', 'rh', 'produtividade', true)
ON CONFLICT ("role", "recurso", "acao") DO NOTHING;
```

- [ ] **Step 7: Page gate** — in `src/app/(dashboard)/rh/produtividade/page.tsx`, replace the imports `requireRole` / `HR_ADMIN_ROLES` and the call:

```ts
import { requirePermission } from "@/lib/session";
// ...
  await requirePermission("rh", "produtividade");
```

- [ ] **Step 8: Export route gate** — in `src/app/api/rh/produtividade/export/route.ts`:

```ts
import { requirePermission } from "@/lib/session";
// ...
  await requirePermission("rh", "produtividade"); // inclui o piso de sócio
```

Remove the now-unused `requireRole` / `HR_ADMIN_ROLES` imports in both files.

- [ ] **Step 9: Apply the migration to the worktree DB and run the tests**

Run: `npx prisma migrate deploy` (data-only migration; `migrate dev` may ask for a reset because of known drift — do not reset).
Expected: `Applying migration 20261007170000_perfis_rh_produtividade` and `All migrations have been successfully applied.`

Then check the grant:

```bash
npx tsx -e "import('./src/lib/prisma').then(async ({prisma})=>{console.log(await prisma.permissaoPerfil.findMany({where:{recurso:'rh',acao:'produtividade'},select:{perfil:{select:{chave:true}}}}));process.exit(0)})" --tsconfig tsconfig.server.json
```

Expected: two rows, `coordenador` and `administrativo`. If the relation is not named `perfil`, query `perfilId` and look up the keys by hand.

Run: `npx vitest run src/lib/permissions-catalog.test.ts src/lib/nav-config.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/permissions-catalog.ts src/lib/permissions-catalog.test.ts src/lib/nav-config.ts prisma/seed.ts prisma/migrations/20261007170000_perfis_rh_produtividade/migration.sql "src/app/(dashboard)/rh/produtividade/page.tsx" src/app/api/rh/produtividade/export/route.ts
git commit -m "feat(permissoes): rh:produtividade — coordenador volta a ver Produtividade no menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 5: Server query `horasProjetistas`

**Files:**
- Modify: `src/modules/rh/produtividade/queries.ts` (replace `ProjetistaHorasDiarias` + `horasDiariasProjetistas`, lines ~50–56 and ~215–277)

**Interfaces:**
- Consumes: `agregarHoras`, `type HorasDoPeriodo`, `type HorasPessoa` (Task 2); `somarDias` (Task 1).
- Produces:
  - `type PessoaHoras = HorasPessoa & { nome: string; role: string }`
  - `type HorasProjetistas = { dias: string[]; destinos: Record<string, string>; pessoas: PessoaHoras[] }`
  - `horasProjetistas(periodo: { de: string; ate: string }, opcoes?: { userIds?: string[]; agora?: Date }): Promise<HorasProjetistas>` — without `userIds` = audience `projeto_membro`; with `userIds` = exactly those users (any role). Returns everyone requested, including people with 0h. Callers filter.

No unit test here: it is a thin Prisma read over the tested `agregarHoras`. Typecheck + the screens in Tasks 6–8 verify it.

- [ ] **Step 1: Replace the type** — delete `ProjetistaHorasDiarias` and add:

```ts
export type PessoaHoras = HorasPessoa & { nome: string; role: string };
export type HorasProjetistas = { dias: string[]; destinos: Record<string, string>; pessoas: PessoaHoras[] };
```

with imports at the top:

```ts
import { agregarHoras, type HorasPessoa } from "@/modules/rh/produtividade/horas";
import { somarDias } from "@/modules/rh/produtividade/periodo";
```

- [ ] **Step 2: Replace `horasDiariasProjetistas` with `horasProjetistas`**

```ts
/**
 * Horas do período por pessoa, dia e destino (projeto / reuniões / sem projeto) — a fonte única das
 * telas de horas. Sem `userIds`, lê a audiência `projeto_membro` (RH → Produtividade); com `userIds`,
 * exatamente essas pessoas, de qualquer perfil (Minhas horas, card do Início).
 */
export async function horasProjetistas(
  periodo: { de: string; ate: string },
  opcoes: { userIds?: string[]; agora?: Date } = {},
): Promise<HorasProjetistas> {
  const agora = opcoes.agora ?? new Date();
  const usuarios = await prisma.user.findMany({
    where: opcoes.userIds ? { id: { in: opcoes.userIds } } : whereAudiencia("projeto_membro"),
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const ids = usuarios.map((u) => u.id);
  const inicio = new Date(`${periodo.de}T00:00:00-03:00`);
  const fimExclusivo = new Date(`${somarDias(periodo.ate, 1)}T00:00:00-03:00`);

  const sessoes =
    ids.length === 0
      ? []
      : await prisma.sessaoTrabalho.findMany({
          where: {
            userId: { in: ids },
            inicio: { lt: fimExclusivo < agora ? fimExclusivo : agora },
            OR: [{ fim: { gte: inicio } }, { fim: null }],
          },
          select: {
            userId: true,
            inicio: true,
            fim: true,
            tipoAlocacao: true,
            projeto: { select: { id: true, codigo: true, nome: true } },
          },
        });

  const agregado = agregarHoras(sessoes, { de: periodo.de, ate: periodo.ate, agora, userIds: ids });
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  return {
    dias: agregado.dias,
    destinos: agregado.destinos,
    pessoas: agregado.pessoas.map((p) => ({ ...p, nome: porId.get(p.userId)!.name, role: porId.get(p.userId)!.role })),
  };
}
```

Remove imports that only the deleted function used (`diaLocal` if now unused — `minutosPorDiaSessao` is still used by `produtividadeProjetistas`).

- [ ] **Step 3: Typecheck the callers** — the page and `horas-diarias-chart.tsx` still reference the old names. They are replaced in Task 6. Keep the build green inside this commit with a temporary bridge in `src/app/(dashboard)/rh/produtividade/page.tsx`:

```ts
import { resolverPeriodo } from "@/modules/rh/produtividade/periodo";
import { diaLocal } from "@/modules/ponto/engine";
// ...
  const periodo = resolverPeriodo({}, diaLocal(new Date()));
  const [dados, horas] = await Promise.all([produtividadeProjetistas(granularidade), horasProjetistas(periodo)]);
  const horasDiarias = {
    dias: horas.dias,
    projetistas: horas.pessoas
      .filter((p) => p.totalHoras > 0)
      .sort((a, b) => b.totalHoras - a.totalHoras || a.nome.localeCompare(b.nome))
      .map((p) => ({ ...p, dias: horas.dias.map((dia, i) => ({ dia, horas: p.porDia[i] })) })),
  };
```

In `horas-diarias-chart.tsx` and `produtividade-view.tsx`, change the type import to a local type:

```ts
type ProjetistaHorasDiarias = { userId: string; nome: string; role: string; totalHoras: number; dias: { dia: string; horas: number }[] };
```

Task 6 deletes this bridge.

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors in the touched files. If the full `tsc` runs out of heap, use `NODE_OPTIONS=--max-old-space-size=8192`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/rh/produtividade/queries.ts "src/app/(dashboard)/rh/produtividade/page.tsx" src/components/rh/horas-diarias-chart.tsx src/components/rh/produtividade-view.tsx
git commit -m "refactor(rh): horasProjetistas lê qualquer período e separa as horas por projeto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 6: RH screen — period, ranking and chart

**Files:**
- Create: `src/components/rh/horas/formato.ts`
- Create: `src/components/rh/horas/seletor-periodo.tsx`
- Create: `src/components/rh/horas/grafico-horas.tsx`
- Create: `src/components/rh/horas/ranking-horas.tsx`
- Create: `src/components/rh/horas/painel-horas-equipe.tsx`
- Modify: `src/components/rh/produtividade-view.tsx`
- Modify: `src/app/(dashboard)/rh/produtividade/page.tsx`
- Delete: `src/components/rh/horas-diarias-chart.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 (`Periodo`, `ATALHOS`, `bucketsDoPeriodo`, `empilharPorDestino`, `somarPorBucket`, `itensDoRankingDeHoras` + constants, `HorasProjetistas`, `PessoaHoras`).
- Produces (reused in Task 7):
  - `rotuloDia(iso: string): string` → `"07/10"`; `rotuloHoras(h: number): string` → `"7,5h"`; `CORES_COMPARACAO: string[]` (5 tokens); `corDoDestino(chave: string, indice: number): string`
  - `<SeletorPeriodo periodo={Periodo} />`
  - `<GraficoHoras dias={string[]} granularidade={Granularidade} modo={"linhas" | "empilhado"} series={{ chave: string; rotulo: string; cor: string; valores: number[] }[]} titulo={string} />` — `valores` aligned to `dias`; it does the bucketing itself.

- [ ] **Step 1: `formato.ts`**

```ts
// src/components/rh/horas/formato.ts
import { DESTINO_OUTROS, DESTINO_REUNIOES, DESTINO_SEM_PROJETO } from "@/modules/rh/produtividade/horas";

export function rotuloDia(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function rotuloHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

/** Uma cor por pessoa comparada (até 5). Tokens, nunca hex. */
export const CORES_COMPARACAO = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"];

/** Pilha por destino: os 5 projetos usam a paleta; os grupos fixos têm cor própria e neutra. */
export function corDoDestino(chave: string, indice: number): string {
  if (chave === DESTINO_REUNIOES) return "var(--info)";
  if (chave === DESTINO_SEM_PROJETO) return "var(--muted-foreground)";
  if (chave === DESTINO_OUTROS) return "color-mix(in oklch, var(--muted-foreground) 45%, var(--card))";
  return CORES_COMPARACAO[indice % CORES_COMPARACAO.length];
}
```

- [ ] **Step 2: `seletor-periodo.tsx`**

```tsx
// src/components/rh/horas/seletor-periodo.tsx
"use client";

import { useState } from "react";
import { useSetParams } from "@/lib/use-set-param";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ATALHOS, intervaloDoAtalho, type Periodo } from "@/modules/rh/produtividade/periodo";
import { cn } from "@/lib/utils";

/** Atalhos + intervalo livre. Grava `?de=&ate=` na URL; o servidor resolve e corta o futuro. */
export function SeletorPeriodo({ periodo, hoje }: { periodo: Periodo; hoje: string }) {
  const setParams = useSetParams();
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap rounded-sm border p-0.5 text-sm" role="group" aria-label="Período">
        {ATALHOS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={periodo.atalho === a.id}
            onClick={() => setParams(intervaloDoAtalho(a.id, hoje))}
            className={cn(
              "rounded-sm px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              periodo.atalho === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ de, ate });
        }}
      >
        <label className="grid gap-1 text-xs text-muted-foreground">
          De
          <Input type="date" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} className="h-8 w-[9.5rem]" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Até
          <Input type="date" value={ate} max={hoje} onChange={(e) => setAte(e.target.value)} className="h-8 w-[9.5rem]" />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={!de || !ate}>
          Aplicar
        </Button>
      </form>
    </div>
  );
}
```

`setParams` accepts `Record<string, string | null>`, and `intervaloDoAtalho` returns `{ de, ate }`, so passing it directly is fine.

- [ ] **Step 3: `grafico-horas.tsx`** — SVG with lines or stacked bars, each bucket focusable, plus a table with the same numbers. Follow the accessibility pattern of `src/components/financeiro/caixa/fluxo-diario-chart.tsx`: each bucket focusable, announcing its values.

```tsx
// src/components/rh/horas/grafico-horas.tsx
"use client";

import { useMemo, useState } from "react";
import { bucketsDoPeriodo, type Granularidade } from "@/modules/rh/produtividade/periodo";
import { somarPorBucket } from "@/modules/rh/produtividade/horas";
import { rotuloDia, rotuloHoras } from "./formato";

export type SerieGrafico = { chave: string; rotulo: string; cor: string; valores: number[] };

const LARGURA = 720;
const ALTURA = 250;
const M = { topo: 18, direita: 16, baixo: 34, esquerda: 38 };

function teto(valor: number) {
  return Math.max(8, Math.ceil(valor / 2) * 2);
}

/**
 * Horas no tempo. `linhas` = uma linha por série (comparação de pessoas); `empilhado` = barras
 * empilhadas (destinos de uma pessoa). Acima do limite diário o período chega agrupado por semana.
 * A tabela embaixo repete os números: a leitura nunca depende só da cor.
 */
export function GraficoHoras({
  dias,
  granularidade,
  modo,
  series,
  titulo,
}: {
  dias: string[];
  granularidade: Granularidade;
  modo: "linhas" | "empilhado";
  series: SerieGrafico[];
  titulo: string;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const buckets = useMemo(() => bucketsDoPeriodo(dias, granularidade), [dias, granularidade]);
  const valores = useMemo(() => series.map((s) => somarPorBucket(s.valores, buckets)), [series, buckets]);
  const rotulos = buckets.map((b) => (granularidade === "semana" ? `sem. ${rotuloDia(b.inicio)}` : rotuloDia(b.inicio)));
  const totais = buckets.map((_, i) => valores.reduce((s, v) => s + v[i], 0));

  const maximo = teto(modo === "empilhado" ? Math.max(0, ...totais) : Math.max(0, ...valores.flat()));
  const larguraUtil = LARGURA - M.esquerda - M.direita;
  const alturaUtil = ALTURA - M.topo - M.baixo;
  const n = buckets.length;
  const passo = larguraUtil / Math.max(n, 1);
  const xCentro = (i: number) => M.esquerda + passo * (i + 0.5);
  const y = (h: number) => M.topo + alturaUtil - (h / maximo) * alturaUtil;
  const larguraBarra = Math.max(2, Math.min(28, passo * 0.7));
  const cadaQuantos = Math.max(1, Math.ceil(n / 14)); // no máximo ~14 rótulos no eixo

  const anuncio = (i: number) =>
    `${rotulos[i]}: ` + series.map((s, k) => `${s.rotulo} ${rotuloHoras(valores[k][i])}`).join(", ");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {titulo}
        {granularidade === "semana" && " · por semana — período longo"}
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-label={titulo} className="h-auto w-full min-w-[560px]">
          {[0, maximo / 2, maximo].map((v) => (
            <g key={v}>
              <line x1={M.esquerda} x2={LARGURA - M.direita} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v === 0 ? undefined : "3 3"} />
              <text x={M.esquerda - 7} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {rotuloHoras(v)}
              </text>
            </g>
          ))}
          {rotulos.map((r, i) =>
            i % cadaQuantos === 0 ? (
              <text key={r} x={xCentro(i)} y={ALTURA - 12} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {r}
              </text>
            ) : null,
          )}

          {modo === "empilhado"
            ? buckets.map((_, i) => {
                let base = 0;
                return (
                  <g key={i}>
                    {series.map((s, k) => {
                      const h = valores[k][i];
                      if (h <= 0) return null;
                      const topo = y(base + h);
                      const altura = y(base) - topo;
                      base += h;
                      return <rect key={s.chave} x={xCentro(i) - larguraBarra / 2} y={topo} width={larguraBarra} height={altura} fill={s.cor} />;
                    })}
                  </g>
                );
              })
            : series.map((s, k) => (
                <g key={s.chave}>
                  <polyline
                    points={valores[k].map((h, i) => `${xCentro(i)},${y(h)}`).join(" ")}
                    fill="none"
                    stroke={s.cor}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {n <= 45 && valores[k].map((h, i) => <circle key={i} cx={xCentro(i)} cy={y(h)} r="3" fill={s.cor} />)}
                </g>
              ))}

          {/* Faixas focáveis: teclado e leitor de tela leem o valor de cada dia/semana. */}
          {buckets.map((_, i) => (
            <rect
              key={`foco-${i}`}
              x={M.esquerda + passo * i}
              y={M.topo}
              width={passo}
              height={alturaUtil}
              fill={foco === i ? "currentColor" : "transparent"}
              className="text-foreground/5 outline-none focus-visible:stroke-ring"
              tabIndex={0}
              aria-label={anuncio(i)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
            >
              <title>{anuncio(i)}</title>
            </rect>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda do gráfico">
        {series.map((s) => (
          <span key={s.chave} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.cor }} aria-hidden />
            {s.rotulo}
          </span>
        ))}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver os números</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-0 text-right tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 bg-card px-2 py-1 text-left font-normal">{granularidade === "semana" ? "Semana" : "Dia"}</th>
                {series.map((s) => (
                  <th key={s.chave} className="px-2 py-1 font-normal">{s.rotulo}</th>
                ))}
                {modo === "empilhado" && <th className="px-2 py-1 font-normal">Total</th>}
              </tr>
            </thead>
            <tbody>
              {buckets.map((_, i) => (
                <tr key={i}>
                  <td className="sticky left-0 bg-card px-2 py-1 text-left">{rotulos[i]}</td>
                  {series.map((s, k) => (
                    <td key={s.chave} className="px-2 py-1">{valores[k][i] > 0 ? rotuloHoras(valores[k][i]) : "·"}</td>
                  ))}
                  {modo === "empilhado" && <td className="px-2 py-1 font-semibold">{rotuloHoras(totais[i])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 4: `ranking-horas.tsx`** — row component defined at top level (ADR-0002: never inside the parent).

```tsx
// src/components/rh/horas/ranking-horas.tsx
"use client";

import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  ACAO_COMPARAR,
  ACAO_POR_PROJETO,
  ACAO_TIRAR,
  itensDoRankingDeHoras,
  LIMITE_COMPARACAO,
} from "@/modules/rh/produtividade/acoes-horas";
import type { PessoaHoras } from "@/modules/rh/produtividade/queries";
import { rotuloHoras } from "./formato";

export function RankingHoras({
  pessoas,
  selecionados,
  cores,
  podeVerEspelho,
  onAlternar,
  onSoEste,
}: {
  pessoas: PessoaHoras[];
  selecionados: string[];
  cores: Record<string, string>;
  podeVerEspelho: boolean;
  onAlternar: (userId: string) => void;
  onSoEste: (userId: string) => void;
}) {
  const maximo = Math.max(1, ...pessoas.map((p) => p.totalHoras));
  return (
    <ul className="divide-y rounded-sm border" aria-label="Ranking de horas no período">
      {pessoas.map((p) => (
        <LinhaRanking
          key={p.userId}
          pessoa={p}
          maximo={maximo}
          selecionado={selecionados.includes(p.userId)}
          totalSelecionados={selecionados.length}
          cor={cores[p.userId]}
          podeVerEspelho={podeVerEspelho}
          onAlternar={onAlternar}
          onSoEste={onSoEste}
        />
      ))}
    </ul>
  );
}

function LinhaRanking({
  pessoa: p,
  maximo,
  selecionado,
  totalSelecionados,
  cor,
  podeVerEspelho,
  onAlternar,
  onSoEste,
}: {
  pessoa: PessoaHoras;
  maximo: number;
  selecionado: boolean;
  totalSelecionados: number;
  cor: string | undefined;
  podeVerEspelho: boolean;
  onAlternar: (userId: string) => void;
  onSoEste: (userId: string) => void;
}) {
  const itens = itensDoRankingDeHoras({ userId: p.userId, selecionado, totalSelecionados, podeVerEspelho });
  const aoSelecionar = (item: AcaoItemAcao) => {
    if (item.id === ACAO_COMPARAR || item.id === ACAO_TIRAR) onAlternar(p.userId);
    if (item.id === ACAO_POR_PROJETO) onSoEste(p.userId);
  };
  const bloqueado = !selecionado && totalSelecionados >= LIMITE_COMPARACAO;

  return (
    <LinhaComMenu itens={itens} onSelect={aoSelecionar} render={<li className="data-[popup-open]:bg-muted/50" />}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto]">
        <button
          type="button"
          aria-pressed={selecionado}
          disabled={bloqueado}
          title={bloqueado ? "Compare no máximo 5 projetistas." : undefined}
          onClick={() => onAlternar(p.userId)}
          className="flex min-w-0 items-center gap-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={cn("size-2.5 shrink-0 rounded-full border", !selecionado && "bg-transparent")}
            style={selecionado && cor ? { background: cor, borderColor: cor } : undefined}
            aria-hidden
          />
          <span className="truncate font-medium">{p.nome}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{ROLE_LABELS[p.role as Role] ?? p.role}</span>
        </button>
        <div className="col-span-2 row-start-2 h-2 rounded-full bg-muted sm:col-span-1 sm:row-start-auto" aria-hidden>
          <div className="h-2 rounded-full bg-primary/70" style={{ width: `${(p.totalHoras / maximo) * 100}%` }} />
        </div>
        <div className="text-right text-xs tabular-nums">
          <span className="font-mono text-sm font-semibold">{rotuloHoras(p.totalHoras)}</span>
          <span className="block text-muted-foreground">
            {rotuloHoras(p.mediaPorDiaComRegistro)}/dia · {p.diasComRegistro} {p.diasComRegistro === 1 ? "dia" : "dias"}
          </span>
        </div>
        <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo={`Ações de ${p.nome}`} className="hidden sm:inline-flex" />
      </div>
    </LinhaComMenu>
  );
}
```

`BotaoAcoes` must stay reachable on touch too. If hiding it under `sm` leaves phones without the `...` (long-press opens the menu), keep it always visible: drop `hidden sm:inline-flex` and give the grid a 3rd column on mobile. Decide by looking at 390 px in Task 9.

- [ ] **Step 5: `painel-horas-equipe.tsx`**

```tsx
// src/components/rh/horas/painel-horas-equipe.tsx
"use client";

import { useMemo, useState } from "react";
import { Clock, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { empilharPorDestino } from "@/modules/rh/produtividade/horas";
import { LIMITE_COMPARACAO } from "@/modules/rh/produtividade/acoes-horas";
import type { Periodo } from "@/modules/rh/produtividade/periodo";
import type { HorasProjetistas } from "@/modules/rh/produtividade/queries";
import { CORES_COMPARACAO, corDoDestino, rotuloDia } from "./formato";
import { GraficoHoras, type SerieGrafico } from "./grafico-horas";
import { RankingHoras } from "./ranking-horas";
import { SeletorPeriodo } from "./seletor-periodo";

export function PainelHorasEquipe({
  horas,
  periodo,
  hoje,
  podeVerEspelho,
}: {
  horas: HorasProjetistas;
  periodo: Periodo;
  hoje: string;
  podeVerEspelho: boolean;
}) {
  const pessoas = useMemo(
    () =>
      horas.pessoas
        .filter((p) => p.totalHoras > 0)
        .sort((a, b) => b.totalHoras - a.totalHoras || a.nome.localeCompare(b.nome)),
    [horas.pessoas],
  );
  const [selecionados, setSelecionados] = useState<string[]>(() => pessoas.slice(0, 1).map((p) => p.userId));
  const ativos = selecionados.map((id) => pessoas.find((p) => p.userId === id)).filter((p) => p !== undefined);
  const cores = Object.fromEntries(selecionados.map((id, i) => [id, CORES_COMPARACAO[i % CORES_COMPARACAO.length]]));

  function alternar(userId: string) {
    setSelecionados((atuais) =>
      atuais.includes(userId)
        ? atuais.filter((id) => id !== userId)
        : atuais.length >= LIMITE_COMPARACAO
          ? atuais
          : [...atuais, userId],
    );
  }

  const series: SerieGrafico[] =
    ativos.length === 1
      ? empilharPorDestino(ativos[0], horas.destinos).map((s, i) => ({ ...s, cor: corDoDestino(s.chave, i) }))
      : ativos.map((p) => ({ chave: p.userId, rotulo: p.nome, cor: cores[p.userId], valores: p.porDia }));

  const intervalo = `${rotuloDia(periodo.de)} a ${rotuloDia(periodo.ate)}`;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" /> Horas no período
          </CardTitle>
          <CardDescription>
            Clique em até {LIMITE_COMPARACAO} nomes para comparar. Com um só nome, o gráfico separa as horas por projeto.
          </CardDescription>
        </div>
        <SeletorPeriodo periodo={periodo} hoje={hoje} />
      </CardHeader>
      <CardContent className="space-y-4">
        {pessoas.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`Sem horas registradas de ${intervalo}.`}
            description="Escolha outro período ou aguarde os registros de ponto dos projetistas."
            className="border-0 py-6 shadow-none"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <RankingHoras
              pessoas={pessoas}
              selecionados={selecionados}
              cores={cores}
              podeVerEspelho={podeVerEspelho}
              onAlternar={alternar}
              onSoEste={(id) => setSelecionados([id])}
            />
            {ativos.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Selecione um projetista no ranking para ver o gráfico.</p>
            ) : (
              <GraficoHoras
                dias={horas.dias}
                granularidade={periodo.granularidade}
                modo={ativos.length === 1 ? "empilhado" : "linhas"}
                series={series}
                titulo={
                  ativos.length === 1
                    ? `Horas de ${ativos[0].nome} por projeto, ${intervalo}`
                    : `Comparação de horas por dia, ${intervalo}`
                }
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

The `filter((p) => p !== undefined)` type guard needs TS 5.5+ inferred predicates. If `tsc` complains, write `.filter((p): p is PessoaHoras => p !== undefined)` and import the type.

Selection survives a period change because `useState` keeps it across RSC re-renders. Ids no longer present simply drop out through the `ativos` filter.

- [ ] **Step 6: Wire into the page and view; delete the old chart**

`src/app/(dashboard)/rh/produtividade/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { diaLocal } from "@/modules/ponto/engine";
import { resolverPeriodo } from "@/modules/rh/produtividade/periodo";
import { horasProjetistas, produtividadeProjetistas, type Granularidade } from "@/modules/rh/produtividade/queries";
import { ProdutividadeView } from "@/components/rh/produtividade-view";

export const metadata: Metadata = { title: "Produtividade — Projetistas" };

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; de?: string; ate?: string }>;
}) {
  const user = await requirePermission("rh", "produtividade");
  const sp = await searchParams;
  const granularidade: Granularidade = sp.g === "mes" ? "mes" : "semana";
  const hoje = diaLocal(new Date());
  const periodo = resolverPeriodo({ de: sp.de, ate: sp.ate }, hoje);
  const [dados, horas, podeVerEspelho] = await Promise.all([
    produtividadeProjetistas(granularidade),
    horasProjetistas(periodo),
    can(user, "ponto", "espelho_equipe"),
  ]);
  return (
    <ProdutividadeView
      periodos={dados.periodos}
      granularidade={dados.granularidade}
      projetistas={dados.projetistas}
      horas={horas}
      periodo={periodo}
      hoje={hoje}
      podeVerEspelho={podeVerEspelho}
    />
  );
}
```

`src/components/rh/produtividade-view.tsx`:
- Props: replace `horasDiarias` with `horas: HorasProjetistas; periodo: Periodo; hoje: string; podeVerEspelho: boolean`. Delete the local bridge type from Task 5.
- Replace `<HorasDiariasChart … />` with `<PainelHorasEquipe horas={horas} periodo={periodo} hoje={hoje} podeVerEspelho={podeVerEspelho} />`.
- The Semanal/Mensal links must keep the period. Build them with the current `de`/`ate`: ``href={`/rh/produtividade?g=${g}&de=${periodo.de}&ate=${periodo.ate}`}``.
- Delete the import of `HorasDiariasChart`.

Then:

```bash
git rm src/components/rh/horas-diarias-chart.tsx
```

- [ ] **Step 7: Verify**

Run: `npx tsc -p tsconfig.json --noEmit` (with `NODE_OPTIONS=--max-old-space-size=8192` if needed)
Expected: no errors.

Run: `npm run lint`
Expected: no new errors or warnings in the touched files. Do not use `--quiet`: warnings revealed missing UI before.

Run: `npx vitest run src/lib src/modules/rh`
Expected: PASS (including the guard tests that scan `src/` for hand-written `contextmenu` handlers and raw fields).

- [ ] **Step 8: Commit**

```bash
git add src/components/rh/horas/formato.ts src/components/rh/horas/seletor-periodo.tsx src/components/rh/horas/grafico-horas.tsx src/components/rh/horas/ranking-horas.tsx src/components/rh/horas/painel-horas-equipe.tsx src/components/rh/produtividade-view.tsx "src/app/(dashboard)/rh/produtividade/page.tsx"
git commit -m "feat(rh): horas no período com ranking, comparação de até 5 e horas por projeto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

Confirm that `horas-diarias-chart.tsx` appears as deleted in the stat (it was staged by `git rm`).

---

### Task 7: "Minhas horas" tab in Ponto

**Files:**
- Create: `src/app/(dashboard)/ponto/horas/page.tsx`
- Create: `src/components/ponto/minhas-horas-view.tsx`
- Modify: `src/components/ponto/ponto-subnav.tsx`

**Interfaces:**
- Consumes: `horasProjetistas` (Task 5), `resolverPeriodo` (Task 1), `empilharPorDestino` (Task 2), `GraficoHoras`, `SeletorPeriodo`, `corDoDestino`, `rotuloHoras`, `rotuloDia` (Task 6).

- [ ] **Step 1: Subnav tab** — in `ponto-subnav.tsx`:

```tsx
import { Clock, CalendarClock, ChartColumnStacked } from "lucide-react";

const ABAS = [
  { href: "/ponto", label: "Bater ponto", icon: Clock },
  { href: "/ponto/espelho", label: "Espelho", icon: CalendarClock },
  { href: "/ponto/horas", label: "Minhas horas", icon: ChartColumnStacked },
] as const;
```

Also add `overflow-x-auto` to the wrapper (`"flex gap-1 overflow-x-auto border-b"`) so 3 tabs never widen the page at 390 px. Update the doc comment to "bater ponto ⇄ espelho ⇄ minhas horas".

- [ ] **Step 2: Page**

```tsx
// src/app/(dashboard)/ponto/horas/page.tsx
import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { diaLocal } from "@/modules/ponto/engine";
import { resolverPeriodo } from "@/modules/rh/produtividade/periodo";
import { horasProjetistas } from "@/modules/rh/produtividade/queries";
import { MinhasHorasView } from "@/components/ponto/minhas-horas-view";
import { PontoSubnav } from "@/components/ponto/ponto-subnav";

export const metadata: Metadata = { title: "Minhas horas" };

/** Sempre as horas de quem está logado — não aceita `?u=` (decisão do dono, 2026-10-07). */
export default async function MinhasHorasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireRole("admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer");
  const sp = await searchParams;
  const hoje = diaLocal(new Date());
  const periodo = resolverPeriodo({ de: sp.de, ate: sp.ate }, hoje);
  const horas = await horasProjetistas(periodo, { userIds: [user.id] });
  return <MinhasHorasView subnav={<PontoSubnav />} horas={horas} periodo={periodo} hoje={hoje} />;
}
```

The role list is copied from `src/app/(dashboard)/ponto/espelho/page.tsx`. If that list changed since this plan was written, copy the current one.

- [ ] **Step 3: View**

```tsx
// src/components/ponto/minhas-horas-view.tsx
"use client";

import { Clock } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { empilharPorDestino } from "@/modules/rh/produtividade/horas";
import type { Periodo } from "@/modules/rh/produtividade/periodo";
import type { HorasProjetistas } from "@/modules/rh/produtividade/queries";
import { corDoDestino, rotuloDia, rotuloHoras } from "@/components/rh/horas/formato";
import { GraficoHoras } from "@/components/rh/horas/grafico-horas";
import { SeletorPeriodo } from "@/components/rh/horas/seletor-periodo";

export function MinhasHorasView({
  subnav,
  horas,
  periodo,
  hoje,
}: {
  subnav: React.ReactNode;
  horas: HorasProjetistas;
  periodo: Periodo;
  hoje: string;
}) {
  const eu = horas.pessoas[0];
  const intervalo = `${rotuloDia(periodo.de)} a ${rotuloDia(periodo.ate)}`;
  const series = eu ? empilharPorDestino(eu, horas.destinos).map((s, i) => ({ ...s, cor: corDoDestino(s.chave, i) })) : [];

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Minhas horas" descricao="Suas horas registradas no ponto, dia a dia e por projeto." />
      {subnav}

      <div className="grid grid-cols-3 gap-3">
        <Resumo rotulo="Total" valor={rotuloHoras(eu?.totalHoras ?? 0)} />
        <Resumo rotulo="Média por dia com registro" valor={rotuloHoras(eu?.mediaPorDiaComRegistro ?? 0)} />
        <Resumo rotulo="Dias com registro" valor={String(eu?.diasComRegistro ?? 0)} />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" /> Horas por projeto
            </CardTitle>
            <CardDescription>{intervalo}</CardDescription>
          </div>
          <SeletorPeriodo periodo={periodo} hoje={hoje} />
        </CardHeader>
        <CardContent>
          {!eu || eu.totalHoras === 0 ? (
            <EmptyState
              icon={Clock}
              title={`Nenhuma hora registrada de ${intervalo}.`}
              description="As horas aparecem aqui conforme você bate o ponto."
              className="border-0 py-6 shadow-none"
            />
          ) : (
            <GraficoHoras
              dias={horas.dias}
              granularidade={periodo.granularidade}
              modo="empilhado"
              series={series}
              titulo={`Suas horas por projeto, ${intervalo}`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="text-[10px] uppercase tracking-[0.14em]">{rotulo}</CardDescription>
        <CardTitle className="font-mono text-xl tabular-nums sm:text-2xl">{valor}</CardTitle>
      </CardHeader>
    </Card>
  );
}
```

Check `CabecalhoPagina`'s prop names in `src/components/shell/cabecalho-pagina.tsx` (`titulo`, `descricao`, `acoes` are used by `produtividade-view.tsx`). The description is plain text, without links.

- [ ] **Step 4: Verify**

Run: `npx tsc -p tsconfig.json --noEmit` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ponto/horas/page.tsx" src/components/ponto/minhas-horas-view.tsx src/components/ponto/ponto-subnav.tsx
git commit -m "feat(ponto): aba Minhas horas com período livre e horas por projeto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 8: Home card "Minhas horas · 14 dias"

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `horasProjetistas` (Task 5), `intervaloDoAtalho` (Task 1), `diaLocal`, existing `KpiSpark` and `PROJETO_MEMBRO_ROLES`.

- [ ] **Step 1: Fetch** — near the top of the page body (after `isGlobal`), add:

```ts
  // Card "Minhas horas" (2026-10-07): atalho para Ponto → Minhas horas, só para quem é membro de projeto.
  const mostraMinhasHoras = PROJETO_MEMBRO_ROLES.includes(user.role as Role);
```

Add `horasProjetistas(intervaloDoAtalho("14d", diaLocal(new Date())), { userIds: [user.id] })` as a new LAST entry of the existing `Promise.all`, gated: `mostraMinhasHoras ? horasProjetistas(...) : Promise.resolve(null)`. Destructure it as `minhasHoras`. Imports:

```ts
import { PROJETO_MEMBRO_ROLES, type Role } from "@/lib/roles";
import { diaLocal } from "@/modules/ponto/engine";
import { intervaloDoAtalho } from "@/modules/rh/produtividade/periodo";
import { horasProjetistas } from "@/modules/rh/produtividade/queries";
```

(`acessoGlobal` is already imported from `@/lib/roles`. Merge into that import line.)

- [ ] **Step 2: `KpiSpark` accepts a formatted value** — change its `valor` prop type from `number` to `number | string` (it renders `{valor}`, so no other change).

- [ ] **Step 3: Render** — replace the KPI row:

```tsx
      {/* KPIs do colaborador + sparkline (Mód 1) */}
      {/* No celular, as contagens já estão em "Para você hoje"; o card de horas fica (é atalho). */}
      <div className={`grid gap-4 ${minhasHoras ? "sm:grid-cols-2 lg:grid-cols-4" : "hidden sm:grid sm:grid-cols-3"}`}>
        {minhasHoras && (
          <KpiSpark
            label="Minhas horas"
            valor={`${(minhasHoras.pessoas[0]?.totalHoras ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`}
            serie={minhasHoras.pessoas[0]?.porDia ?? []}
            href="/ponto/horas"
          />
        )}
        <div className="hidden sm:contents">
          <KpiSpark label="Projetos em revisão" valor={kpisMeu.emRevisao} serie={kpisMeu.serieEmRevisao} href="/projetos/meu-trabalho" />
          <KpiSpark label="Aprovados no mês" valor={kpisMeu.aprovadosMes} serie={kpisMeu.serieAprovados} href="/projetos/meu-trabalho" />
          <KpiSpark label="Validações pendentes" valor={kpisMeu.validacoesPendentes} serie={kpisMeu.serieValidacoes} href="/projetos/meu-trabalho" />
        </div>
      </div>
```

`KpiSpark` already prints "últimos 14 dias" under the sparkline, which matches the card's period.

- [ ] **Step 4: Verify**

Run: `npx tsc -p tsconfig.json --noEmit` and `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "feat(inicio): card Minhas horas dos últimos 14 dias, atalho para o ponto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 9: Manual, full verification, screen check

**Files:**
- Modify: `docs/manual/rh-ponto/produtividade.md`
- Modify: `docs/manual/rh-ponto/ponto.md`

- [ ] **Step 1: Manual — `produtividade.md`**: replace the "Como acessar", "O que a tela mostra" and "Permissões" sections, and add FAQ entries:

```markdown
## Como acessar

- Menu → **Produtividade** (`/rh/produtividade`). Exige a permissão **"Ver horas e produtividade dos
  projetistas"** (`rh:produtividade`), que já vem para Coordenador e Administrativo.

## O que a tela mostra

- **Horas no período**: escolha 7 dias, 14 dias, 30 dias, mês atual, mês anterior ou um intervalo
  livre (De / Até). Não há limite de período; acima de 92 dias o gráfico passa a mostrar **por semana**.
- **Ranking**: todos os projetistas com horas no período, do maior total para o menor, com a média por
  dia com registro e quantos dias tiveram registro.
- **Comparar**: clique em até **cinco** nomes para ver as linhas de horas por dia lado a lado.
- **Por projeto**: com um nome só selecionado, o gráfico separa as horas por projeto (os cinco maiores,
  "Outros projetos", "Reuniões" e "Sem projeto"). Em "Ver os números" ficam os mesmos valores em tabela.
- Botão direito (ou toque longo, ou o `...`) numa linha do ranking: Comparar / Tirar da comparação, Ver
  por projeto e Abrir espelho de ponto.
- Embaixo continua a produtividade por **semana** ou **mês** (entregas, tarefas, horas e atrasos).

## Permissões

- `rh:produtividade`. O projetista vê só as próprias horas em **Ponto → Minhas horas**.
```

FAQ additions:

```markdown
**Por que o gráfico ficou por semana?** O período passou de 92 dias; dia a dia as barras ficariam finas demais para ler.

**O que entra em "Sem projeto"?** Horas de ponto sem projeto escolhido. Reuniões internas e externas aparecem juntas em "Reuniões".
```

- [ ] **Step 2: Manual — `ponto.md`**: add a section (place it after the section about the Espelho):

```markdown
## Minhas horas

Aba **Minhas horas** (`/ponto/horas`): suas horas registradas no período escolhido (7, 14 ou 30 dias,
mês atual, mês anterior ou intervalo livre), com total, média por dia com registro e um gráfico por
projeto. Só mostra as suas horas. O card **Minhas horas** no Início traz os últimos 14 dias e abre esta aba.
```

- [ ] **Step 3: Full verification**

Make sure no `next dev` is running from THIS folder before building (it corrupts `.next`).

Run: `npm run lint` → Expected: no errors.
Run: `npm test` → Expected: all pass.
Run: `npm run build` → Expected: success.

If any fails, fix before continuing. Do not claim success without the output.

- [ ] **Step 4: Screen check** (dev server on port 3001: `npm run dev -- -p 3001`; test admin `claude.admin@dev.senahub` / `ClaudeDev@2026`)

Check, and report each result:
1. `/rh/produtividade` at 1366×768 with the menu open: header does not overlap the top bar; ranking + chart side by side; selecting 1 name shows stacked bars + legend; 2–5 names show lines; the 6th is disabled with "Compare no máximo 5 projetistas."; right-click on a row opens the menu.
2. Same page with `?de=2026-01-01&ate=2026-10-07` (> 92 days): title says "por semana — período longo".
3. Same page with `?de=lixo`: falls back to 14 days, no error.
4. `/ponto/horas` and `/` (Início) at 390×844: `document.documentElement.scrollWidth === 390`; the 3 Ponto tabs fit or scroll inside their bar; the "Minhas horas" card shows and links to `/ponto/horas`.
5. Log in as a projetista (create or pick a demo user with role `projetista_pj`): `/rh/produtividade` redirects to `/sem-permissao`; `/ponto/horas?u=<other id>` still shows only their own hours.

If the dev DB has no sessions in the period, run the check over `mes_anterior` or a wider range that has data. Do not invent data.

- [ ] **Step 5: Commit**

```bash
git add docs/manual/rh-ponto/produtividade.md docs/manual/rh-ponto/ponto.md
git commit -m "docs(manual): horas no período, comparação, por projeto e Minhas horas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

- [ ] **Step 6: Deploy note for the owner** (report in the final message, do not run on the server):
  - 1 new migration (`20261007170000_perfis_rh_produtividade`, data only, idempotent) → `prisma migrate deploy` on the server.
  - No `db:seed` needed (the migration also writes the legacy `permissao` rows).
  - No push and no PR without the owner's OK.
