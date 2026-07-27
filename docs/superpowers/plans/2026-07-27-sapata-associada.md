# Engine `sapata-associada` (Situação IV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a ferramenta `sapata-associada` (E27) — dimensionamento de sapata que reúne dois pilares por uma viga de rigidez, com centro de carga, reação de solo distribuída, diagramas DEC/DMF, flexão e cisalhamento da viga.

**Architecture:** Engine puro em `calc/sapata-associada.ts` que **reusa** os engines existentes `concrete-beam-flexure.ts` (E01, flexão), `concrete-beam-shear.ts` (cisalhamento), `slab-bares.ts` (`armaduraFaixa` p/ a base) e `bitolas.ts` (detalhamento) — mesmo padrão de composição de `eccentric-footing.ts`. Diagrama DEC/DMF via campo `MemoriaSecao.imagens`. Integra pelos 4 pontos do módulo.

**Tech Stack:** TypeScript, Zod, Vitest (node env).

**Origem:** Fase 6 do estudo comparativo `docs/calculadoras` × `ferramentas` (conselho de subagentes, 2026-07). Reimplementa a Situação IV (linhas 305-359 do arquivo de referência) em unidades nativas, reusando os engines estruturais do módulo.

## Global Constraints

- Engine puro e testado; unidades nativas: força **kN**, momento **kN·m**, tensão **kPa**, dimensões **cm**, comprimento de vão **m**.
- Conversões só para fixtures: `1 tf = 9,80665 kN`; `1 kgf/cm² = 98,0665 kPa`.
- **Reusar, não reimplementar** flexão/cisalhamento: chamar `calcular` de `concrete-beam-flexure` e `calcularCisalhamento` de `concrete-beam-shear`.
- Chave estável `sapata-associada`, disciplina `Fundações`, `tipo: "completa"`, `versaoCalc` inicial `1`.
- **Dependência da Task 2 (diagrama):** campo `MemoriaSecao.imagens` (Task 1.1 do plano-mestre) deve existir.
- `npm run lint` + `npx vitest run src/modules/ferramentas/calc/sapata-associada.test.ts` verdes antes de cada commit.

## File Structure

- `src/modules/ferramentas/calc/sapata-associada.ts` — engine. **Responsabilidade:** geometria da base + esforços (DEC/DMF) + armaduras via reuso.
- `src/modules/ferramentas/calc/sapata-associada.test.ts` — testes (fixture Situação IV).
- `src/modules/ferramentas/memoria/diagramas/dec-dmf.ts` (+ `.test.ts`) — builder SVG dos diagramas.
- Modificados: `registry.ts`, `service.ts`, `savefile.ts`.

**Contratos reusados (confirmados no código):**
- `concrete-beam-flexure.ts`: `calcular({ secao: {forma:"retangular", b, h}, d, fck, aco, Mk, gamaF }) → { As, AsLinha, situacao, alertas, ... }`; `ACOS = {"CA-25":250,"CA-50":500,"CA-60":600}`.
- `concrete-beam-shear.ts`: `calcularCisalhamento({ bw, d, fck, Vk, gamaF }) → { aswSadotar, sMax, alertas, situacao, ... }`.
- `slab-bares.ts`: `armaduraFaixa(mPorM, d, fck, fyd, faixa) → { as, excede }`.
- `bitolas.ts`: `selecionarBarras(asNec, phiMm) → { n, phiMm, asEf }`.

---

### Task 1: Engine `sapata-associada`

**Files:**
- Create: `src/modules/ferramentas/calc/sapata-associada.ts`
- Test: `src/modules/ferramentas/calc/sapata-associada.test.ts`

**Interfaces:**
- Produces: `entradaSchema`, `calcular(input): ResultadoAssociada`, `type ResultadoAssociada`.

- [ ] **Step 1: Escrever o teste com a fixture Situação IV**

Situação IV: P1=80 tf (=784,53 kN), P2=120 tf (=1176,80 kN), x=150 cm, fck=25, σadm=2,5 kgf/cm² (=245,17 kPa), Δx=100 cm, b1=b2=20, t1=40, t2=60 cm, dV=90 cm. `Xcc=P2·x/(P1+P2)=90 cm`.

```ts
// sapata-associada.test.ts
import { describe, it, expect } from "vitest";
import { calcular } from "./sapata-associada";

describe("sapata-associada (Situação IV)", () => {
  const base = {
    p1: 784.53, p2: 1176.8, xCm: 150, sigmaAdmKpa: 245.17,
    fck: 25, aco: "CA-50" as const, balancoCm: 100,
    b1Cm: 20, b2Cm: 20, t1Cm: 40, t2Cm: 60, dVigaCm: 90,
  };

  it("centro de carga, base e esforços coerentes", () => {
    const r = calcular(base);
    expect(r.xccCm).toBeCloseTo((1176.8 * 150) / (784.53 + 1176.8), 2); // 90 cm
    expect(r.bwCm).toBe(80); // máx(40+20, 60+20)
    expect(r.baseBcm % 10).toBe(0);
    expect(r.baseLcm % 10).toBe(0);
    expect(r.qKnM).toBeGreaterThan(0);
    expect(r.mkKnM).toBeGreaterThan(0);
    expect(r.vkKn).toBeGreaterThan(0);
    expect(r.asVigaCm2).toBeGreaterThan(0);
    expect(r.aswSporM).toBeGreaterThan(0);
  });

  it("q = ΣP/L (reação uniforme)", () => {
    const r = calcular(base);
    expect(r.qKnM).toBeCloseTo((base.p1 + base.p2) / (r.baseLcm / 100), 4);
  });

  it("posições dos pilares dentro do comprimento", () => {
    const r = calcular(base);
    expect(r.posP1M).toBeGreaterThan(0);
    expect(r.posP2M).toBeGreaterThan(r.posP1M);
    expect(r.posP2M).toBeLessThan(r.baseLcm / 100);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/sapata-associada.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o engine**

```ts
/**
 * Engine E27 — Sapata associada com viga de rigidez (NBR 6118:2023 / NBR 6122).
 * Puro. Cargas kN, momentos kN·m, σ kPa, dimensões cm, vão m, armadura cm².
 *
 * Reúne dois pilares por uma viga de rigidez sobre uma base retangular B×L.
 * Passos: centro de carga (Xcc) → comprimento L (2·meio-comprimento) → largura B (área/L) →
 * reação de solo uniforme q = ΣP/L → DEC/DMF por varredura → flexão e cisalhamento da viga
 * (reusa E01) → armadura transversal da base (armaduraFaixa).
 */

import { z } from "zod";
import { ACOS, calcular as calcularViga } from "./concrete-beam-flexure";
import { calcularCisalhamento } from "./concrete-beam-shear";
import { armaduraFaixa } from "./slab-bares";
import { selecionarBarras } from "./bitolas";

const acoEnum = z.enum(["CA-25", "CA-50", "CA-60"]);

export const entradaSchema = z.object({
  p1: z.number().positive(), // kN — pilar 1
  p2: z.number().positive(), // kN — pilar 2
  xCm: z.number().positive(), // distância entre eixos dos pilares
  sigmaAdmKpa: z.number().positive(),
  fck: z.number().min(20).max(90),
  aco: acoEnum,
  balancoCm: z.number().positive().default(100), // Δx além da face externa
  b1Cm: z.number().positive(), // P1 — dim. no eixo da viga
  b2Cm: z.number().positive(), // P2 — dim. no eixo da viga
  t1Cm: z.number().positive(), // P1 — dim. transversal
  t2Cm: z.number().positive(), // P2 — dim. transversal
  dVigaCm: z.number().positive(), // altura útil da viga de rigidez
});
export type EntradaAssociada = z.infer<typeof entradaSchema>;
export type EntradaAssociadaInput = z.input<typeof entradaSchema>;

export type ResultadoAssociada = {
  xccCm: number;
  baseBcm: number;
  baseLcm: number;
  bwCm: number;
  qKnM: number;
  mkKnM: number;
  vkKn: number;
  posP1M: number;
  posP2M: number;
  sapataHcm: number;
  asN1PorM: number; // cm²/m — armadura transversal da base
  asVigaCm2: number; // cm² — flexão da viga
  aswSporM: number; // cm²/m — estribos
  sMaxCm: number; // espaçamento máx dos estribos
  detalheViga: { n: number; phiMm: number };
  alertas: string[];
  situacao: "ok" | "revisar";
};

export function calcular(input: EntradaAssociadaInput): ResultadoAssociada {
  const v = entradaSchema.parse(input);
  const alertas: string[] = [];
  const somaP = v.p1 + v.p2;

  // Geometria da base.
  const xccCm = (v.p2 * v.xCm) / somaP; // centro de carga a partir do eixo de P1
  const l2Cm = Math.max(xccCm + v.b1Cm / 2 + v.balancoCm, v.xCm - xccCm + v.b2Cm / 2 + v.balancoCm);
  const baseLcm = Math.ceil((2 * l2Cm) / 10) * 10;
  const lM = baseLcm / 100;
  const areaReqM2 = somaP / v.sigmaAdmKpa;
  const baseBcm = Math.ceil(((areaReqM2 / lM) * 100) / 10) * 10;
  const bM = baseBcm / 100;
  const bwCm = Math.max(v.t1Cm + 20, v.t2Cm + 20);
  const relLB = baseLcm / baseBcm;
  if (relLB < 2 || relLB > 2.5) alertas.push(`Relação L/B = ${relLB.toFixed(2)} fora do recomendado (2,0–2,5).`);

  // Reação de solo uniforme e posições dos pilares.
  const qKnM = somaP / lM;
  const posP1M = (l2Cm - xccCm) / 100;
  const posP2M = posP1M + v.xCm / 100;

  // DEC/DMF por varredura (q para cima; P1/P2 para baixo). Amostra + pontos de descontinuidade.
  const N = 2000;
  const eps = 1e-6;
  const amostras: number[] = [];
  for (let i = 0; i <= N; i++) amostras.push((i * lM) / N);
  amostras.push(posP1M - eps, posP1M + eps, posP2M - eps, posP2M + eps);
  amostras.sort((a, b) => a - b);
  let vkKn = 0;
  let mkKnM = 0;
  for (const xx of amostras) {
    if (xx < 0 || xx > lM) continue;
    const V = qKnM * xx - (xx > posP1M ? v.p1 : 0) - (xx > posP2M ? v.p2 : 0);
    const M = (qKnM * xx * xx) / 2 - (xx > posP1M ? v.p1 * (xx - posP1M) : 0) - (xx > posP2M ? v.p2 * (xx - posP2M) : 0);
    vkKn = Math.max(vkKn, Math.abs(V));
    mkKnM = Math.max(mkKnM, Math.abs(M));
  }

  // Base (sapata): altura e armadura transversal (flexão do balanço além da viga).
  const sapataDcm = Math.ceil(Math.max((baseBcm - bwCm) / 3, 15) / 5) * 5;
  const sapataHcm = sapataDcm + 5;
  const fyd = ACOS[v.aco] / 10 / 1.15; // kN/cm²
  const sigmaSoloKpa = somaP / (bM * lM);
  const sigmaD = 1.4 * sigmaSoloKpa;
  const overhangM = (baseBcm - bwCm) / 2 / 100;
  const mN1 = (sigmaD * overhangM * overhangM) / 2; // kN·m/m
  const armN1 = armaduraFaixa(mN1, sapataDcm, v.fck, fyd, 1);
  const asN1PorM = armN1.as;
  if (armN1.excede) alertas.push("Base: x/d excede o limite na flexão transversal — aumentar a altura da base.");

  // Viga de rigidez: flexão (reusa E01) e cisalhamento.
  const hVigaCm = v.dVigaCm + 5;
  let asVigaCm2 = 0;
  try {
    const rv = calcularViga({
      secao: { forma: "retangular", b: bwCm, h: hVigaCm },
      d: v.dVigaCm,
      fck: v.fck,
      aco: v.aco,
      Mk: Math.max(mkKnM, 0.01),
      gamaF: 1.4,
    });
    asVigaCm2 = rv.As + rv.AsLinha;
    alertas.push(...rv.alertas);
    if (rv.situacao === "revisar") alertas.push("Viga de rigidez: revisar a seção à flexão.");
  } catch {
    alertas.push("Não foi possível dimensionar a viga à flexão (verificar bw/dV).");
  }
  const cis = calcularCisalhamento({ bw: bwCm, d: v.dVigaCm, fck: v.fck, Vk: Math.max(vkKn, 0.01), gamaF: 1.4 });
  alertas.push(...cis.alertas);

  const detalheViga = selecionarBarras(Math.max(asVigaCm2, 0.01), 16); // ø16 mm (preliminar)

  const situacao: "ok" | "revisar" =
    alertas.some((a) => a.includes("revisar") || a.includes("excede") || a.includes("rompe")) ? "revisar" : "ok";

  return {
    xccCm, baseBcm, baseLcm, bwCm, qKnM, mkKnM, vkKn, posP1M, posP2M,
    sapataHcm, asN1PorM, asVigaCm2, aswSporM: cis.aswSadotar, sMaxCm: cis.sMax,
    detalheViga, alertas, situacao,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/sapata-associada.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/sapata-associada.ts src/modules/ferramentas/calc/sapata-associada.test.ts
git commit -m "feat(ferramentas): engine de sapata associada com viga de rigidez (DEC/DMF)"
```

---

### Task 2: Diagrama DEC/DMF (SVG)

Depende do campo `MemoriaSecao.imagens` (Task 1.1 do plano-mestre). Desenha os diagramas de esforço cortante (DEC) e momento fletor (DMF) ao longo da viga.

**Files:**
- Create: `src/modules/ferramentas/memoria/diagramas/dec-dmf.ts`
- Create: `src/modules/ferramentas/memoria/diagramas/dec-dmf.test.ts`

**Interfaces:**
- Consumes: `{ lM, posP1M, posP2M, qKnM, p1, p2 }` (de `ResultadoAssociada` + entradas).
- Produces: `svgDecDmf(args): string`.

- [ ] **Step 1: Teste (falha antes)**

```ts
import { describe, it, expect } from "vitest";
import { svgDecDmf } from "./dec-dmf";

describe("svgDecDmf", () => {
  it("gera <svg> com dois diagramas (DEC e DMF)", () => {
    const svg = svgDecDmf({ lM: 4, posP1M: 1.2, posP2M: 2.7, qKnM: 490, p1: 784, p2: 1177 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("DEC");
    expect(svg).toContain("DMF");
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar (referência: `svgDECDMF` do arquivo, linhas 136-167)**

```ts
/** Diagramas DEC (cortante) e DMF (momento) da viga de rigidez. Puro; <svg> autocontido. */
export function svgDecDmf(args: { lM: number; posP1M: number; posP2M: number; qKnM: number; p1: number; p2: number }): string {
  const { lM, posP1M, posP2M, qKnM, p1, p2 } = args;
  const Np = 400;
  const V: [number, number][] = [];
  const M: [number, number][] = [];
  let vMax = 0, mMax = 0;
  const xs: number[] = [];
  for (let i = 0; i <= Np; i++) xs.push((i * lM) / Np);
  const eps = 1e-9;
  for (const xp of [posP1M, posP2M]) if (xp > 0 && xp < lM) xs.push(xp - eps, xp + eps);
  xs.sort((a, b) => a - b);
  for (const x of xs) {
    const v = qKnM * x - (x > posP1M ? p1 : 0) - (x > posP2M ? p2 : 0);
    const m = (qKnM * x * x) / 2 - (x > posP1M ? p1 * (x - posP1M) : 0) - (x > posP2M ? p2 * (x - posP2M) : 0);
    V.push([x, v]); M.push([x, m]);
    vMax = Math.max(vMax, Math.abs(v)); mMax = Math.max(mMax, Math.abs(m));
  }
  const W = 760, H1 = 150, pad = 48, plotW = W - 2 * pad;
  const sx = (x: number) => pad + (x / lM) * plotW;
  const f0 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  function plot(data: [number, number][], max: number, cor: string, titulo: string, yOff: number, invert: boolean): string {
    const cy = yOff + H1 / 2;
    const sy = (val: number) => cy - ((invert ? -val : val) / (max || 1)) * (H1 / 2 - 20);
    let d = `M${sx(0).toFixed(1)},${cy.toFixed(1)}`;
    for (const [x, val] of data) d += `L${sx(x).toFixed(1)},${sy(val).toFixed(1)}`;
    d += `L${sx(lM).toFixed(1)},${cy.toFixed(1)}Z`;
    return `<text x="${pad}" y="${(yOff + 12).toFixed(1)}" fill="#b45309" font-size="11" font-weight="bold">${titulo}</text>
      <path d="${d}" fill="${cor}22" stroke="${cor}" stroke-width="1.6"/>
      <line x1="${pad}" y1="${cy.toFixed(1)}" x2="${W - pad}" y2="${cy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${2 * H1 + 30}" width="${W}" xmlns="http://www.w3.org/2000/svg" style="background:#fff">
    ${plot(V, vMax, "#2563eb", `DEC — Cortante | Vmáx = ${f0(vMax)} kN`, 8, false)}
    ${plot(M, mMax, "#16a34a", `DMF — Momento | Mmáx = ${f0(mMax)} kN·m`, H1 + 20, true)}
  </svg>`;
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/memoria/diagramas/dec-dmf.ts src/modules/ferramentas/memoria/diagramas/dec-dmf.test.ts
git commit -m "feat(ferramentas): diagramas DEC/DMF da viga de rigidez"
```

---

### Task 3: Integração (registry + service + savefile + memória)

**Files:**
- Modify: `src/modules/ferramentas/registry.ts`
- Modify: `src/modules/ferramentas/service.ts`
- Modify: `src/modules/ferramentas/savefile.ts`

**Interfaces:**
- Consumes: `calcular`/`entradaSchema` de `sapata-associada.ts`; `svgDecDmf`; `montarMemoriaBase`, `fmtNum` (já em `service.ts`).

- [ ] **Step 1: Registrar em `registry.ts`**

Reusar o ícone `SquareStack` (já importado):

```ts
  {
    key: "sapata-associada",
    nome: "Sapata Associada (viga de rigidez)",
    descricao: "Sapata que reúne dois pilares por viga de rigidez: centro de carga, base B×L, reação de solo, diagramas DEC/DMF e dimensionamento da viga (flexão e cisalhamento).",
    disciplina: "Fundações",
    tipo: "completa",
    norma: "NBR 6118/6122",
    exportaveis: ["pdf", "xlsx"],
    icon: SquareStack,
  },
```

- [ ] **Step 2: `savefile.ts` — import + entrada no map**

```ts
import { entradaSchema as sapataAssociadaSchema } from "./calc/sapata-associada";
```

No `ENTRADAS_SCHEMAS`:

```ts
  "sapata-associada": sapataAssociadaSchema,
```

- [ ] **Step 3: `service.ts` — imports**

```ts
import { calcular as calcularAssociada, entradaSchema as sapataAssociadaSchema } from "./calc/sapata-associada";
import { svgDecDmf } from "./memoria/diagramas/dec-dmf";
```

- [ ] **Step 4: `service.ts` — `case` em `calcular`**

Antes do `default:` do `switch` de `calcular`:

```ts
    case "sapata-associada": {
      const r = calcularAssociada(sapataAssociadaSchema.parse(entradas));
      return {
        campos: {
          base: `${r.baseBcm}×${r.baseLcm} cm`,
          "q (kN/m)": fmtNum(r.qKnM, 0),
          "Mk (kN·m)": fmtNum(r.mkKnM, 0),
          "Vk (kN)": fmtNum(r.vkKn, 0),
          "As viga (cm²)": fmtNum(r.asVigaCm2, 2),
          situação: r.situacao,
        },
        alertas: r.alertas,
      };
    }
```

- [ ] **Step 5: `service.ts` — `case` em `montarMemoria` + builder**

No `switch` de `montarMemoria`, antes do `default:`:

```ts
    case "sapata-associada":
      return memoriaSapataAssociada(entradas, base);
```

Builder (junto às demais `memoria*`):

```ts
function memoriaSapataAssociada(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = sapataAssociadaSchema.parse(entradas);
  const r = calcularAssociada(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Geometria da base",
        valores: [
          { descricao: "Centro de carga", simbolo: "Xcc", valor: fmtNum(r.xccCm, 1), unidade: "cm", formula: "P2·x/(P1+P2)" },
          { descricao: "Base (B × L)", valor: `${r.baseBcm} × ${r.baseLcm}`, unidade: "cm" },
          { descricao: "Largura da viga", simbolo: "bw", valor: r.bwCm, unidade: "cm", formula: "máx(t1+20, t2+20)" },
          { descricao: "Altura da base", valor: r.sapataHcm, unidade: "cm" },
        ],
      },
      {
        titulo: "Esforços solicitantes (reação de solo distribuída)",
        valores: [
          { descricao: "Reação distribuída", simbolo: "q", valor: fmtNum(r.qKnM, 0), unidade: "kN/m", formula: "ΣP/L" },
          { descricao: "Momento característico", simbolo: "Mk", valor: fmtNum(r.mkKnM, 0), unidade: "kN·m" },
          { descricao: "Cortante característico", simbolo: "Vk", valor: fmtNum(r.vkKn, 0), unidade: "kN" },
        ],
        imagens: [{ titulo: "Diagramas DEC/DMF", svg: svgDecDmf({ lM: r.baseLcm / 100, posP1M: r.posP1M, posP2M: r.posP2M, qKnM: r.qKnM, p1: e.p1, p2: e.p2 }) }],
      },
      {
        titulo: "Armaduras",
        valores: [
          { descricao: "Base (transversal)", simbolo: "As,N1", valor: fmtNum(r.asN1PorM, 2), unidade: "cm²/m" },
          { descricao: "Viga (flexão)", simbolo: "As", valor: fmtNum(r.asVigaCm2, 2), unidade: "cm²", formula: `≈ ${r.detalheViga.n}ø${r.detalheViga.phiMm} mm` },
          { descricao: "Estribos", simbolo: "Asw/s", valor: fmtNum(r.aswSporM, 2), unidade: "cm²/m", formula: `s ≤ ${fmtNum(r.sMaxCm, 0)} cm` },
        ],
        notas: r.alertas,
      },
    ],
  });
}
```

- [ ] **Step 6: Rodar suíte completa + lint; commit**

Run: `npm test && npm run lint`
Expected: tudo verde.

```bash
git add src/modules/ferramentas/registry.ts src/modules/ferramentas/service.ts src/modules/ferramentas/savefile.ts
git commit -m "feat(ferramentas): integra sapata-associada (registry/service/savefile/memória)"
```

---

## Self-Review

- **Cobertura:** Situação IV → Tasks 1-3. ✔
- **Reuso confirmado:** flexão via `calcularViga` (E01), cisalhamento via `calcularCisalhamento`, base via `armaduraFaixa`, detalhamento via `selecionarBarras` — nenhuma fórmula estrutural reimplementada. ✔
- **Consistência de tipos:** `ResultadoAssociada` (Task 1) consumido pelo diagrama (Task 2) e pela integração (Task 3); `svgDecDmf` recebe exatamente `{lM,posP1M,posP2M,qKnM,p1,p2}`. ✔
- **Dependências declaradas:** campo `imagens` (plano-mestre Task 1.1) para as Tasks 2/3. ✔
- **Placeholders:** nenhum — todo passo tem código completo. ✔
- **Nota de engenharia:** armaduras de pele/distribuição (N5/N6 da Situação IV) foram omitidas por serem detalhamento construtivo (percentuais mínimos), não dimensionamento — podem ser acrescentadas como notas fixas se o escritório exigir no memorial.
