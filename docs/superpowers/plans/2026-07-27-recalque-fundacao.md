# Engine `recalque-fundacao` (Situações VIII–XI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a ferramenta `recalque-fundacao` (E28) — estimativa de recalque de sapata rasa em 4 modos (imediato elástico, imediato por fatias/Holl, adensamento primário, compressão secundária) — fechando a lacuna de ELS de fundação exigida pela NBR 6122, hoje inexistente no SenaHub.

**Architecture:** Um único engine puro em `calc/recalque-fundacao.ts` com `z.discriminatedUnion("modo", …)` (mesmo padrão de `eccentric-footing.ts`). Integra-se pelos 4 pontos mecânicos do módulo (`registry` + `calc` + `service` + `savefile`). O diagrama de recalque por fatia usa o campo `MemoriaSecao.imagens` (SVG inline no PDF).

**Tech Stack:** TypeScript, Zod, Vitest (node env).

**Origem:** Fase 3 do estudo comparativo `docs/calculadoras` × `ferramentas` (conselho de subagentes, 2026-07-26/27). Reimplementa a metodologia das Situações VIII/IX/X/XI do arquivo de referência a partir das normas — o arquivo é usado só como fonte de fórmula e de fixtures.

## Global Constraints

- **Engine puro e testado:** `calc/recalque-fundacao.ts` sem I/O; `calc/recalque-fundacao.test.ts` com vitest.
- **Unidades:** profundidade/espessura em **m**, força em **kN**, tensão em **kPa**, recalque de saída em **mm** (imediato) ou **cm** (adensamento/secundária — coerente com a ordem de grandeza usual). Documentar por campo.
- **Zero solo hardcoded:** perfil vem de `camadas[]`; módulos `Es = α·K·N` derivados do tipo de solo da camada, nunca arrays fixos do exemplo didático.
- **Correlações são estimativa, não método primário:** emitir alertas de faixa de validade (Iw extrapolado para L/B>2; μ de Skempton–Bjerrum vem de tabela, não recalculado).
- **Chave estável:** `recalque-fundacao`, disciplina `Fundações`, `tipo: "completa"`, `versaoCalc` inicial `1`.
- **Prerequisito da Task 2 (modo fatias):** `src/modules/ferramentas/calc/spt-shared.ts` deve existir (criado no plano `sapata-spt` / Fase 2), exportando `SOLOS`, `camadaSptSchema`, `type TipoSolo`, `type CamadaSpt`, `nMedioPonderado`. Se ainda não existir, executar antes a Task 2.1 daquele plano.
- **Prova de execução:** `npm run lint` e `npx vitest run src/modules/ferramentas/calc/recalque-fundacao.test.ts` verdes antes de cada commit.

## File Structure

- `src/modules/ferramentas/calc/recalque-fundacao.ts` — engine (union de 4 modos). **Responsabilidade:** cálculo puro de recalque.
- `src/modules/ferramentas/calc/recalque-fundacao.test.ts` — testes (fixtures das Situações VIII–XI).
- `src/modules/ferramentas/memoria/diagramas/recalque-fatias.ts` (+ `.test.ts`) — builder SVG do gráfico de fatias.
- Modificados: `registry.ts`, `service.ts`, `savefile.ts`.

---

### Task 1: Engine — modo `elastico` (Situação IX)

Recalque imediato pela teoria da elasticidade: `ρ = q·B·(1−ν²)/Eu·Iw`, `Iw` interpolado (L/B=1→0,86; L/B=2→1,17), verificação de rigidez `Hb ≥ máx[(B−bp)/3,(L−lp)/3]`.

**Files:**
- Create: `src/modules/ferramentas/calc/recalque-fundacao.ts`
- Test: `src/modules/ferramentas/calc/recalque-fundacao.test.ts`

**Interfaces:**
- Produces: `entradaSchema` (discriminated union — começa só com `elastico`), `type ResultadoRecalque`, `function calcular(input): ResultadoRecalque`, `type ResultadoElastico`.

- [ ] **Step 1: Escrever o teste da fixture Situação IX**

```ts
// recalque-fundacao.test.ts
import { describe, it, expect } from "vitest";
import { calcular } from "./recalque-fundacao";

describe("recalque-fundacao / elastico (Situação IX)", () => {
  it("q, rigidez, Iw interpolado e recalque coerentes", () => {
    const r = calcular({ modo: "elastico", fz: 800, bM: 2.5, lM: 3.2, hbM: 0.9, apCm: 25, lpCm: 65, euKpa: 30000, nu: 0.5 });
    if (r.modo !== "elastico") throw new Error("modo inesperado");
    expect(r.qKpa).toBeCloseTo(800 / (2.5 * 3.2), 3); // 100 kPa
    // rigidez: Hb=90 cm ≥ max((250-25)/3=75 ; (320-65)/3=85) → rígida
    expect(r.rigida).toBe(true);
    const lb = 3.2 / 2.5; // 1,28
    expect(r.lb).toBeCloseTo(lb, 6);
    expect(r.iw).toBeCloseTo(0.86 + (lb - 1) * (1.17 - 0.86), 6);
    const esperadoMm = (r.qKpa * 2.5 * (1 - 0.5 * 0.5)) / 30000 * r.iw * 1000;
    expect(r.recalqueMm).toBeCloseTo(esperadoMm, 4);
  });

  it("marca flexível e alerta quando Hb é insuficiente", () => {
    const r = calcular({ modo: "elastico", fz: 800, bM: 2.5, lM: 3.2, hbM: 0.3, apCm: 25, lpCm: 65, euKpa: 30000, nu: 0.5 });
    if (r.modo !== "elastico") throw new Error("modo");
    expect(r.rigida).toBe(false);
    expect(r.alertas.some((a) => a.includes("flexível"))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/recalque-fundacao.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Criar o engine com o modo `elastico`**

```ts
/**
 * Engine E28 — Recalque de fundação rasa (NBR 6122). Puro.
 * Modos: "elastico" (teoria da elasticidade), "fatias" (Holl + Teixeira & Godoy),
 *        "adensamento" (Terzaghi/Skempton-Bjerrum/Taylor), "secundaria" (Cα + total).
 * Unidades: comprimento/profundidade em m, força kN, tensão kPa; recalque imediato em mm,
 *           recalque de adensamento/secundário em cm (ordem de grandeza usual).
 */

import { z } from "zod";

// ─────────────────────────── modo elastico ───────────────────────────
const elasticoSchema = z.object({
  modo: z.literal("elastico"),
  fz: z.number().positive(), // kN
  bM: z.number().positive(), // m — menor lado
  lM: z.number().positive(), // m — maior lado
  hbM: z.number().positive(), // m — altura da sapata
  apCm: z.number().positive(), // cm — pilar (dir. B)
  lpCm: z.number().positive(), // cm — pilar (dir. L)
  euKpa: z.number().positive(), // kPa — módulo de deformabilidade (não drenado)
  nu: z.number().min(0).max(0.5).default(0.5), // coef. de Poisson
});

export const entradaSchema = z.discriminatedUnion("modo", [elasticoSchema]);
export type EntradaRecalque = z.infer<typeof entradaSchema>;
export type EntradaRecalqueInput = z.input<typeof entradaSchema>;

export type ResultadoElastico = {
  modo: "elastico";
  qKpa: number;
  rigida: boolean;
  hMinRigidaCm: number;
  lb: number;
  iw: number;
  recalqueMm: number;
  alertas: string[];
};

export type ResultadoRecalque = ResultadoElastico;

export function calcular(input: EntradaRecalqueInput): ResultadoRecalque {
  const v = entradaSchema.parse(input);
  switch (v.modo) {
    case "elastico":
      return calcularElastico(v);
  }
}

function calcularElastico(v: z.infer<typeof elasticoSchema>): ResultadoElastico {
  const alertas: string[] = [];
  const qKpa = v.fz / (v.bM * v.lM);
  const hMinRigidaCm = Math.max((v.bM * 100 - v.apCm) / 3, (v.lM * 100 - v.lpCm) / 3);
  const rigida = v.hbM * 100 >= hMinRigidaCm;
  if (!rigida) {
    alertas.push("Hb < máx[(B−bp)/3, (L−lp)/3]: sapata flexível — o fator Iw de sapata rígida não se aplica com rigor.");
  }
  const lb = v.lM / v.bM;
  if (lb > 2) alertas.push("L/B > 2: fator de forma Iw extrapolado além da faixa tabelada (0,86–1,17).");
  const iw = 0.86 + (lb - 1) * (1.17 - 0.86);
  const recalqueMm = (qKpa * v.bM * (1 - v.nu * v.nu)) / v.euKpa * iw * 1000;
  return { modo: "elastico", qKpa, rigida, hMinRigidaCm, lb, iw, recalqueMm, alertas };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/recalque-fundacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/recalque-fundacao.ts src/modules/ferramentas/calc/recalque-fundacao.test.ts
git commit -m "feat(ferramentas): recalque de fundação — modo elástico"
```

---

### Task 2: Engine — modo `fatias` (Holl + Teixeira & Godoy, Situação VIII)

**Prerequisito:** `calc/spt-shared.ts` (Fase 2). Adiciona o membro `fatias` ao union.

**Files:**
- Modify: `src/modules/ferramentas/calc/recalque-fundacao.ts`
- Modify: `src/modules/ferramentas/calc/recalque-fundacao.test.ts`

**Interfaces:**
- Consumes: `camadaSptSchema`, `type TipoSolo`, `type CamadaSpt` de `./spt-shared`.
- Produces: `type ResultadoFatias` (com `fatias: { i; zM; dzM; esKpa; dSigmaKpa; rhoMm }[]`), incorporado a `ResultadoRecalque`.

- [ ] **Step 1: Escrever o teste da fixture Situação VIII**

```ts
// adicionar em recalque-fundacao.test.ts
describe("recalque-fundacao / fatias (Holl, Situação VIII)", () => {
  it("q, número de fatias (até 6B) e recalque coerentes", () => {
    const r = calcular({
      modo: "fatias", fz: 411.88, bM: 1.0, lM: 1.4,
      camadas: [
        { solo: "argila_arenosa", nspt: 15, espessuraM: 2 },
        { solo: "areia_argilosa", nspt: 20, espessuraM: 5 },
      ],
    });
    if (r.modo !== "fatias") throw new Error("modo");
    expect(r.qKpa).toBeCloseTo(411.88 / (1.0 * 1.4), 2);
    // Σdz ≥ 6B = 6,0 m
    const somaDz = r.fatias.reduce((s, f) => s + f.dzM, 0);
    expect(somaDz).toBeGreaterThanOrEqual(6.0 - 1e-9);
    expect(r.fatias.length).toBeGreaterThan(0);
    expect(r.recalqueMm).toBeGreaterThan(0);
    // Es da 1ª fatia (argila arenosa, N=15): α=7·K=0,30·15 = 31,5 MPa = 31500 kPa
    expect(r.fatias[0].esKpa).toBeCloseTo(7 * 0.30 * 15 * 1000, 3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/recalque-fundacao.test.ts -t "fatias"`
Expected: FAIL.

- [ ] **Step 3: Adicionar imports, tabela α·K, schema e função**

No topo do arquivo, após o import do zod:

```ts
import { camadaSptSchema, type TipoSolo, type CamadaSpt } from "./spt-shared";

/** Coeficientes de Teixeira & Godoy (1996) por tipo de solo: Es = α·K·N (K em MPa). */
const ALFA_K: Record<TipoSolo, { alpha: number; K: number }> = {
  areia: { alpha: 3, K: 0.9 },
  areia_siltosa: { alpha: 3, K: 0.7 },
  areia_argilosa: { alpha: 3, K: 0.55 },
  silte: { alpha: 5, K: 0.35 },
  silte_arenoso: { alpha: 5, K: 0.45 },
  silte_argiloso: { alpha: 5, K: 0.25 },
  argila: { alpha: 7, K: 0.2 },
  argila_arenosa: { alpha: 7, K: 0.3 },
  argila_siltosa: { alpha: 7, K: 0.22 },
};
```

Adicionar o schema do modo fatias (antes do `entradaSchema`):

```ts
const fatiasSchema = z.object({
  modo: z.literal("fatias"),
  fz: z.number().positive(), // kN
  bM: z.number().positive(), // m — menor lado (usado na discretização e como B)
  lM: z.number().positive(), // m — maior lado
  camadas: z.array(camadaSptSchema).min(1), // perfil abaixo da base
});
```

Trocar a linha do union para incluir o novo membro:

```ts
export const entradaSchema = z.discriminatedUnion("modo", [elasticoSchema, fatiasSchema]);
```

Adicionar o tipo e ampliar `ResultadoRecalque`:

```ts
export type FatiaRecalque = { i: number; zM: number; dzM: number; esKpa: number; dSigmaKpa: number; rhoMm: number };
export type ResultadoFatias = {
  modo: "fatias";
  qKpa: number;
  fatias: FatiaRecalque[];
  recalqueMm: number;
  alertas: string[];
};
export type ResultadoRecalque = ResultadoElastico | ResultadoFatias;
```

Adicionar o `case` no `switch` de `calcular`:

```ts
    case "fatias":
      return calcularFatias(v);
```

E as funções auxiliares + `calcularFatias`:

```ts
/** Es (kPa) na profundidade zi (m) abaixo da base, pela camada que a contém. */
function esNaProfundidade(camadas: CamadaSpt[], zi: number): number {
  let acc = 0;
  for (const c of camadas) {
    acc += c.espessuraM;
    if (zi <= acc + 1e-9) {
      const p = ALFA_K[c.solo];
      return p.alpha * p.K * c.nspt * 1000; // MPa → kPa
    }
  }
  const last = camadas[camadas.length - 1];
  const p = ALFA_K[last.solo];
  return p.alpha * p.K * last.nspt * 1000;
}

/** Espessuras Δz das fatias: 0,25B (z<B), 0,5B (B≤z<2B), 1,0B (z≥2B) até Σ ≥ 6B. */
function gerarFatias(bM: number): number[] {
  const zmax = 6 * bM;
  const dzs: number[] = [];
  let z = 0;
  while (z < zmax - 1e-9) {
    let dz = z < bM ? 0.25 * bM : z < 2 * bM ? 0.5 * bM : 1.0 * bM;
    dz = Math.min(dz, zmax - z);
    dzs.push(dz);
    z += dz;
  }
  return dzs;
}

function calcularFatias(v: z.infer<typeof fatiasSchema>): ResultadoFatias {
  const alertas: string[] = [];
  const qKpa = v.fz / (v.bM * v.lM);
  // Holl: Δσ no canto de área a×b (a = L/2, b = B/2); Δσ_total = 4·Δσ_parcial (ponto central).
  const a = v.lM / 2;
  const b = v.bM / 2;
  const dzs = gerarFatias(v.bM);
  const fatias: FatiaRecalque[] = [];
  let z = 0;
  let recalqueMm = 0;
  dzs.forEach((dz, idx) => {
    const zi = z + dz / 2; // profundidade do centro da fatia
    z += dz;
    const R1 = Math.hypot(a, zi);
    const R2 = Math.hypot(b, zi);
    const R3 = Math.sqrt(a * a + b * b + zi * zi);
    const dsp =
      (qKpa / (2 * Math.PI)) *
      (Math.atan((a * b) / (zi * R3)) + ((a * b * zi) / R3) * (1 / (R1 * R1) + 1 / (R2 * R2)));
    const dSigmaKpa = 4 * dsp;
    const esKpa = esNaProfundidade(v.camadas, zi);
    const rhoMm = esKpa > 0 ? (dSigmaKpa * dz) / esKpa * 1000 : 0;
    recalqueMm += rhoMm;
    fatias.push({ i: idx + 1, zM: zi, dzM: dz, esKpa, dSigmaKpa, rhoMm });
  });
  const somaCamadas = v.camadas.reduce((s, c) => s + c.espessuraM, 0);
  if (somaCamadas < 6 * v.bM) {
    alertas.push(`Perfil informado (${somaCamadas.toFixed(1)} m) < 6B (${(6 * v.bM).toFixed(1)} m): fatias profundas usam o Es da última camada — informar sondagem mais profunda.`);
  }
  return { modo: "fatias", qKpa, fatias, recalqueMm, alertas };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/recalque-fundacao.test.ts`
Expected: PASS (elastico + fatias).

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/recalque-fundacao.ts src/modules/ferramentas/calc/recalque-fundacao.test.ts
git commit -m "feat(ferramentas): recalque por fatias (Holl + Teixeira & Godoy)"
```

---

### Task 3: Engine — modo `adensamento` (Situação X)

**Files:**
- Modify: `src/modules/ferramentas/calc/recalque-fundacao.ts` (+ `.test.ts`)

**Interfaces:**
- Produces: `type ResultadoAdensamento`, incorporado a `ResultadoRecalque`.

- [ ] **Step 1: Teste da fixture Situação X**

```ts
describe("recalque-fundacao / adensamento (Situação X)", () => {
  it("ρa, correção μ e tempos coerentes", () => {
    const r = calcular({
      modo: "adensamento", dqKpa: 100, hM: 10, cc: 0.30, e0: 1.8,
      sigmaIniKpa: 68, mu: 0.84, cvCm2s: 0.004, tDias: 30,
    });
    if (r.modo !== "adensamento") throw new Error("modo");
    const Hcm = 1000, sf = 168;
    const raEsperado = (0.30 * Hcm) / (1 + 1.8) * Math.log10(sf / 68);
    expect(r.rhoTeoricoCm).toBeCloseTo(raEsperado, 4);
    expect(r.rhoRealCm).toBeCloseTo(0.84 * raEsperado, 4);
    // t100 = 2,0·Hd²/cv ; Hd = 500 cm
    expect(r.t100Anos).toBeCloseTo((2.0 * 500 * 500) / 0.004 / 31536000, 3);
    expect(r.rhoTdiasCm).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run …/recalque-fundacao.test.ts -t "adensamento"` → FAIL.

- [ ] **Step 3: Adicionar schema, tipo, case e função**

Schema (antes do `entradaSchema`):

```ts
const adensamentoSchema = z.object({
  modo: z.literal("adensamento"),
  dqKpa: z.number().positive(), // acréscimo de tensão no meio da camada
  hM: z.number().positive(), // espessura da camada de argila (m)
  cc: z.number().positive(), // índice de compressão
  e0: z.number().positive(), // índice de vazios inicial
  sigmaIniKpa: z.number().positive(), // σ' inicial no meio da camada
  mu: z.number().min(0).max(1).default(1), // fator de Skempton–Bjerrum (de tabela)
  cvCm2s: z.number().positive(), // coef. de adensamento (cm²/s)
  tDias: z.number().positive().default(30), // instante para recalque parcial
});
```

Union: `z.discriminatedUnion("modo", [elasticoSchema, fatiasSchema, adensamentoSchema])`.

Tipo + `ResultadoRecalque`:

```ts
export type ResultadoAdensamento = {
  modo: "adensamento";
  rhoTeoricoCm: number;
  rhoRealCm: number;
  t100Anos: number;
  t50Meses: number;
  rhoTdiasCm: number;
  alertas: string[];
};
export type ResultadoRecalque = ResultadoElastico | ResultadoFatias | ResultadoAdensamento;
```

`case "adensamento": return calcularAdensamento(v);` no switch, e a função:

```ts
function calcularAdensamento(v: z.infer<typeof adensamentoSchema>): ResultadoAdensamento {
  const alertas: string[] = [];
  const Hcm = v.hM * 100;
  const sf = v.sigmaIniKpa + v.dqKpa; // σ'f (argila NC → σ'p = σ'i)
  const rhoTeoricoCm = (v.cc * Hcm) / (1 + v.e0) * Math.log10(sf / v.sigmaIniKpa);
  const rhoRealCm = v.mu * rhoTeoricoCm;
  alertas.push("μ (Skempton–Bjerrum) é obtido de tabela em função de A e H/B — informado como entrada, não recalculado.");

  const Hd = Hcm / 2; // drenagem dupla (cm)
  const t100 = (2.0 * Hd * Hd) / v.cvCm2s; // s (Tv=2,0 p/ U≈99,9%)
  const t100Anos = t100 / 31536000;
  const T50 = (Math.PI / 4) * 0.25; // Taylor, U=0,5
  const t50 = (T50 * Hd * Hd) / v.cvCm2s; // s
  const t50Meses = t50 / 2592000;
  const t = v.tDias * 86400; // s
  const Tt = (v.cvCm2s * t) / (Hd * Hd);
  const Ut = Math.min(Math.sqrt((4 * Tt) / Math.PI), 1); // Taylor (válido U≤0,6; capado em 1)
  const rhoTdiasCm = Ut * rhoRealCm;
  if (Ut > 0.6) alertas.push("U(t) > 60%: aproximação de Taylor T=(π/4)U² perde precisão nessa faixa.");
  return { modo: "adensamento", rhoTeoricoCm, rhoRealCm, t100Anos, t50Meses, rhoTdiasCm, alertas };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run …/recalque-fundacao.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/recalque-fundacao.ts src/modules/ferramentas/calc/recalque-fundacao.test.ts
git commit -m "feat(ferramentas): recalque por adensamento primário (Terzaghi/Skempton-Bjerrum/Taylor)"
```

---

### Task 4: Engine — modo `secundaria` + recalque total (Situação XI)

**Files:**
- Modify: `src/modules/ferramentas/calc/recalque-fundacao.ts` (+ `.test.ts`)

- [ ] **Step 1: Teste da fixture Situação XI**

```ts
describe("recalque-fundacao / secundaria (Situação XI)", () => {
  it("ρs, ρtotal e admissibilidade", () => {
    const r = calcular({
      modo: "secundaria", caPct: 0.6, t2Anos: 50, t1Anos: 3.96, hM: 10,
      rhoImediatoCm: 0.59, rhoAdensamentoCm: 35.35, rhoAdmCm: 5.0,
    });
    if (r.modo !== "secundaria") throw new Error("modo");
    const rsEsperado = (0.6 / 100) * Math.log10(50 / 3.96) * 1000; // H=1000 cm
    expect(r.rhoSecundariaCm).toBeCloseTo(rsEsperado, 4);
    expect(r.rhoTotalCm).toBeCloseTo(0.59 + 35.35 + rsEsperado, 4);
    expect(r.aceitavel).toBe(false); // argila mole governa
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `-t "secundaria"` → FAIL.

- [ ] **Step 3: Adicionar schema, tipo, case e função**

Schema:

```ts
const secundariaSchema = z.object({
  modo: z.literal("secundaria"),
  caPct: z.number().positive(), // Cα (%)
  t2Anos: z.number().positive(),
  t1Anos: z.number().positive(), // fim do adensamento primário
  hM: z.number().positive(),
  rhoImediatoCm: z.number().min(0),
  rhoAdensamentoCm: z.number().min(0),
  rhoAdmCm: z.number().positive().default(5),
});
```

Union: `z.discriminatedUnion("modo", [elasticoSchema, fatiasSchema, adensamentoSchema, secundariaSchema])`.

Tipo + `ResultadoRecalque`:

```ts
export type ResultadoSecundaria = {
  modo: "secundaria";
  rhoSecundariaCm: number;
  rhoTotalCm: number;
  aceitavel: boolean;
  alertas: string[];
};
export type ResultadoRecalque =
  | ResultadoElastico | ResultadoFatias | ResultadoAdensamento | ResultadoSecundaria;
```

`case "secundaria": return calcularSecundaria(v);`, e a função:

```ts
function calcularSecundaria(v: z.infer<typeof secundariaSchema>): ResultadoSecundaria {
  const alertas: string[] = [];
  const Hcm = v.hM * 100;
  const rhoSecundariaCm = (v.caPct / 100) * Math.log10(v.t2Anos / v.t1Anos) * Hcm;
  const rhoTotalCm = v.rhoImediatoCm + v.rhoAdensamentoCm + rhoSecundariaCm;
  const aceitavel = rhoTotalCm <= v.rhoAdmCm;
  if (!aceitavel) {
    alertas.push(
      "Recalque total > admissível: considerar fundação profunda (estacas/tubulões) atravessando a argila mole, " +
        "melhoria/tratamento do solo (pré-carregamento com drenos, colunas granulares) ou redistribuição de cargas.",
    );
  }
  return { modo: "secundaria", rhoSecundariaCm, rhoTotalCm, aceitavel, alertas };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run …/recalque-fundacao.test.ts` → PASS (4 modos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/recalque-fundacao.ts src/modules/ferramentas/calc/recalque-fundacao.test.ts
git commit -m "feat(ferramentas): compressão secundária e recalque total"
```

---

### Task 5: Diagrama de recalque por fatias (SVG)

Depende da Task 1.1 do plano-mestre (campo `MemoriaSecao.imagens` já existir). Gera o gráfico de barras `ρᵢ` + linha `Δσ`.

**Files:**
- Create: `src/modules/ferramentas/memoria/diagramas/recalque-fatias.ts`
- Create: `src/modules/ferramentas/memoria/diagramas/recalque-fatias.test.ts`

**Interfaces:**
- Consumes: `FatiaRecalque[]` de `recalque-fundacao.ts`.
- Produces: `svgRecalqueFatias(fatias: { rhoMm: number; dSigmaKpa: number }[]): string`.

- [ ] **Step 1: Teste (falha antes)**

```ts
import { describe, it, expect } from "vitest";
import { svgRecalqueFatias } from "./recalque-fatias";

describe("svgRecalqueFatias", () => {
  it("gera <svg> com uma barra por fatia", () => {
    const svg = svgRecalqueFatias([
      { rhoMm: 3.2, dSigmaKpa: 80 },
      { rhoMm: 1.1, dSigmaKpa: 40 },
    ]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("não quebra com lista vazia", () => {
    expect(svgRecalqueFatias([]).startsWith("<svg")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar (cores de impressão fixas)**

```ts
/** Barras de recalque ρᵢ por fatia + linha de acréscimo de tensão Δσ. Puro; <svg> autocontido. */
export function svgRecalqueFatias(fatias: { rhoMm: number; dSigmaKpa: number }[]): string {
  const W = 720, H = 300, pad = 48, y0 = 240;
  const n = Math.max(fatias.length, 1);
  const maxRho = Math.max(...fatias.map((f) => f.rhoMm), 1e-6);
  const maxDs = Math.max(...fatias.map((f) => f.dSigmaKpa), 1e-6);
  const bw = (W - 2 * pad) / n - 12;
  const f2 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  let barras = "";
  let curva = "";
  fatias.forEach((f, i) => {
    const x = pad + i * ((W - 2 * pad) / n) + 6;
    const hh = (f.rhoMm / maxRho) * 150;
    barras +=
      `<rect x="${x.toFixed(1)}" y="${(y0 - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="#2563eb" opacity="0.85"/>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 - hh - 4).toFixed(1)}" fill="#2563eb" font-size="10" text-anchor="middle">${f2(f.rhoMm)}</text>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 + 14).toFixed(1)}" fill="#475569" font-size="10" text-anchor="middle">F${i + 1}</text>`;
    curva += (i ? "L" : "M") + (x + bw / 2).toFixed(1) + "," + (y0 - (f.dSigmaKpa / maxDs) * 150).toFixed(1);
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg" style="background:#fff">
    <text x="${W / 2}" y="20" fill="#b45309" font-size="12" font-weight="bold" text-anchor="middle">Recalque ρᵢ por fatia (mm) — barras; acréscimo Δσ (kPa) — linha</text>
    ${barras}
    ${curva ? `<path d="${curva}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 3"/>` : ""}
    <line x1="${pad - 8}" y1="${y0}" x2="${W - pad + 8}" y2="${y0}" stroke="#334155"/>
    <text x="${W / 2}" y="${H - 8}" fill="#475569" font-size="11" text-anchor="middle">Fatias abaixo da base da sapata</text>
  </svg>`;
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/memoria/diagramas/recalque-fatias.ts src/modules/ferramentas/memoria/diagramas/recalque-fatias.test.ts
git commit -m "feat(ferramentas): diagrama de recalque por fatias"
```

---

### Task 6: Integração (registry + service + savefile + memória)

Pluga a ferramenta nos 4 pontos e monta a memória (uma seção por modo).

**Files:**
- Modify: `src/modules/ferramentas/registry.ts`
- Modify: `src/modules/ferramentas/service.ts`
- Modify: `src/modules/ferramentas/savefile.ts`

**Interfaces:**
- Consumes: `calcular`/`entradaSchema` de `recalque-fundacao.ts`; `svgRecalqueFatias` do diagrama; `montarMemoriaBase`, `fmtNum`, `getFerramenta` (já em `service.ts`).

- [ ] **Step 1: Registrar em `registry.ts`**

Após a entrada `estaca-spt` no array `FERRAMENTAS`, reusando o ícone `ArrowDownToLine` (já importado):

```ts
  {
    key: "recalque-fundacao",
    nome: "Recalque de Fundação Rasa",
    descricao: "Estimativa de recalque de sapata: imediato (elástico e por fatias/Holl), por adensamento primário e compressão secundária. Verificação de ELS (NBR 6122).",
    disciplina: "Fundações",
    tipo: "completa",
    norma: "NBR 6122",
    exportaveis: ["pdf", "xlsx"],
    icon: ArrowDownToLine,
  },
```

- [ ] **Step 2: `savefile.ts` — import + entrada no map**

Adicionar o import (junto aos demais):

```ts
import { entradaSchema as recalqueSchema } from "./calc/recalque-fundacao";
```

E no `ENTRADAS_SCHEMAS`:

```ts
  "recalque-fundacao": recalqueSchema,
```

- [ ] **Step 3: `service.ts` — imports**

Adicionar (junto aos outros imports de `calc/*` e de diagramas):

```ts
import { calcular as calcularRecalque, entradaSchema as recalqueSchema } from "./calc/recalque-fundacao";
import { svgRecalqueFatias } from "./memoria/diagramas/recalque-fatias";
```

- [ ] **Step 4: `service.ts` — `case "recalque-fundacao"` em `calcular`**

Antes do `default:` do `switch` de `calcular`:

```ts
    case "recalque-fundacao": {
      const r = calcularRecalque(recalqueSchema.parse(entradas));
      if (r.modo === "elastico") {
        return {
          campos: { "ρ (mm)": fmtNum(r.recalqueMm, 2), rigidez: r.rigida ? "rígida" : "flexível", Iw: fmtNum(r.iw, 3), "q (kPa)": fmtNum(r.qKpa, 0) },
          alertas: r.alertas,
        };
      }
      if (r.modo === "fatias") {
        return {
          campos: { "ρ (mm)": fmtNum(r.recalqueMm, 2), fatias: r.fatias.length, "q (kPa)": fmtNum(r.qKpa, 0) },
          alertas: r.alertas,
        };
      }
      if (r.modo === "adensamento") {
        return {
          campos: { "ρ (cm)": fmtNum(r.rhoRealCm, 2), "t100 (anos)": fmtNum(r.t100Anos, 1), "ρ(30d) (cm)": fmtNum(r.rhoTdiasCm, 2) },
          alertas: r.alertas,
        };
      }
      return {
        campos: { "ρtotal (cm)": fmtNum(r.rhoTotalCm, 2), "ρs (cm)": fmtNum(r.rhoSecundariaCm, 2), aceitável: r.aceitavel ? "sim" : "não" },
        alertas: r.alertas,
      };
    }
```

- [ ] **Step 5: `service.ts` — `case` em `montarMemoria` + builder**

No `switch` de `montarMemoria`, antes do `default:`:

```ts
    case "recalque-fundacao":
      return memoriaRecalqueFundacao(entradas, base);
```

E a função builder (junto às demais `memoria*` do arquivo):

```ts
function memoriaRecalqueFundacao(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = recalqueSchema.parse(entradas);
  const r = calcularRecalque(e);
  if (r.modo === "elastico") {
    return montarMemoriaBase({
      ...base,
      secoes: [
        {
          titulo: "Recalque imediato (teoria da elasticidade)",
          valores: [
            { descricao: "Tensão aplicada", simbolo: "q", valor: fmtNum(r.qKpa, 1), unidade: "kPa", formula: "Fz/(B·L)" },
            { descricao: "Rigidez da sapata", valor: r.rigida ? "rígida" : "flexível", formula: "Hb ≥ máx[(B−bp)/3, (L−lp)/3]" },
            { descricao: "Relação L/B", valor: fmtNum(r.lb, 2) },
            { descricao: "Fator de forma", simbolo: "Iw", valor: fmtNum(r.iw, 4), formula: "interp. 0,86 (L/B=1) … 1,17 (L/B=2)" },
            { descricao: "Recalque imediato", simbolo: "ρ", valor: fmtNum(r.recalqueMm, 2), unidade: "mm", formula: "q·B·(1−ν²)/Eu·Iw" },
          ],
          notas: r.alertas,
        },
      ],
    });
  }
  if (r.modo === "fatias") {
    return montarMemoriaBase({
      ...base,
      secoes: [
        {
          titulo: "Recalque imediato por fatias (Holl + Teixeira & Godoy)",
          valores: [
            { descricao: "Tensão aplicada", simbolo: "q", valor: fmtNum(r.qKpa, 1), unidade: "kPa" },
            { descricao: "Recalque total", simbolo: "ρ", valor: fmtNum(r.recalqueMm, 2), unidade: "mm", formula: "Σ ρᵢ = Σ Δσᵢ·Δzᵢ/E_Si" },
          ],
          tabelas: [
            {
              titulo: "Fatias",
              colunas: ["Fatia", "z (m)", "Δz (m)", "E_S (kPa)", "Δσ (kPa)", "ρᵢ (mm)"],
              linhas: r.fatias.map((f) => [f.i, fmtNum(f.zM, 2), fmtNum(f.dzM, 2), fmtNum(f.esKpa, 0), fmtNum(f.dSigmaKpa, 2), fmtNum(f.rhoMm, 3)]),
            },
          ],
          imagens: [{ titulo: "Recalque por fatia", svg: svgRecalqueFatias(r.fatias) }],
          notas: r.alertas,
        },
      ],
    });
  }
  if (r.modo === "adensamento") {
    return montarMemoriaBase({
      ...base,
      secoes: [
        {
          titulo: "Recalque por adensamento primário",
          valores: [
            { descricao: "Recalque teórico", simbolo: "ρa", valor: fmtNum(r.rhoTeoricoCm, 2), unidade: "cm", formula: "Cc·H/(1+e0)·log(σ'f/σ'p)" },
            { descricao: "Recalque corrigido", simbolo: "ρreal", valor: fmtNum(r.rhoRealCm, 2), unidade: "cm", formula: "μ·ρa (Skempton–Bjerrum)" },
            { descricao: "Tempo p/ recalque total", valor: fmtNum(r.t100Anos, 2), unidade: "anos", formula: "t = 2,0·Hd²/cv" },
            { descricao: "Tempo p/ U = 50%", valor: fmtNum(r.t50Meses, 1), unidade: "meses" },
            { descricao: "Recalque no instante t", valor: fmtNum(r.rhoTdiasCm, 2), unidade: "cm", formula: "U(t)·ρreal" },
          ],
          notas: r.alertas,
        },
      ],
    });
  }
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Compressão secundária e recalque total",
        valores: [
          { descricao: "Recalque secundário", simbolo: "ρs", valor: fmtNum(r.rhoSecundariaCm, 2), unidade: "cm", formula: "Cα·log(t2/t1)·H" },
          { descricao: "Recalque total", simbolo: "ρt", valor: fmtNum(r.rhoTotalCm, 2), unidade: "cm", formula: "ρi + ρa + ρs" },
          { descricao: "Admissível", valor: r.aceitavel ? "ACEITÁVEL" : "NÃO ACEITÁVEL" },
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
git commit -m "feat(ferramentas): integra recalque-fundacao (registry/service/savefile/memória)"
```

---

## Self-Review

- **Cobertura:** IX→Task 1; VIII→Task 2; X→Task 3; XI→Task 4; diagrama→Task 5; integração→Task 6. ✔
- **Consistência de tipos:** `ResultadoRecalque` cresce a cada task (union); `FatiaRecalque` definido na Task 2 e consumido na Task 5/6; `calcularRecalque`/`recalqueSchema` importados na Task 6 com os nomes exportados na Task 1. ✔
- **Sem solo hardcoded:** `ALFA_K` é tabela de propriedade de material (coeficientes normativos), não perfil de exemplo; o perfil sempre vem de `camadas[]`. ✔
- **Dependências externas declaradas:** `spt-shared.ts` (Fase 2) para a Task 2; campo `imagens` (Task 1.1 do plano-mestre) para as Tasks 5/6. ✔
- **Placeholders:** nenhum — todo passo tem código completo. ✔
