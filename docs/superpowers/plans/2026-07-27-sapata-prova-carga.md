# Engine `sapata-prova-carga` (Situação I) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a ferramenta `sapata-prova-carga` (E25) — pré-dimensionamento de sapata quadrada a partir de ensaio de placa (critério de Boston, NBR 6489/6122) com extrapolação do recalque da placa para a sapata.

**Architecture:** Engine puro em `calc/sapata-prova-carga.ts` + integração pelos 4 pontos do módulo (`registry`/`calc`/`service`/`savefile`). Sem perfil de solo (usa só resultados do ensaio de placa) — é o engine mais simples do lote.

**Tech Stack:** TypeScript, Zod, Vitest (node env).

**Origem:** Fase 4 do estudo comparativo `docs/calculadoras` × `ferramentas` (conselho de subagentes, 2026-07). Reimplementa a Situação I (linhas 231-247 do arquivo de referência) em unidades nativas do módulo.

## Global Constraints

- Engine puro e testado; unidades nativas: força **kN**, tensão **kPa**, comprimento **cm** (dimensões) / **mm** (recalque).
- Conversões só para fixtures: `1 tf = 9,80665 kN`; `1 kgf/cm² = 98,0665 kPa`.
- Correlação = estimativa: alertar quando a extrapolação por semelhança de diâmetro perder validade (B/Bp grande).
- Chave estável `sapata-prova-carga`, disciplina `Fundações`, `tipo: "rapida"`, `versaoCalc` inicial `1`.
- `npm run lint` + `npx vitest run src/modules/ferramentas/calc/sapata-prova-carga.test.ts` verdes antes de cada commit.

## File Structure

- `src/modules/ferramentas/calc/sapata-prova-carga.ts` — engine. **Responsabilidade:** σadm por Boston + lado B + recalque extrapolado.
- `src/modules/ferramentas/calc/sapata-prova-carga.test.ts` — testes (fixture Situação I).
- Modificados: `registry.ts`, `service.ts`, `savefile.ts`.

---

### Task 1: Engine `sapata-prova-carga`

**Files:**
- Create: `src/modules/ferramentas/calc/sapata-prova-carga.ts`
- Test: `src/modules/ferramentas/calc/sapata-prova-carga.test.ts`

**Interfaces:**
- Produces:
```ts
export const entradaSchema: z.ZodType; // { fz, sigma10Kpa, sigma25Kpa, rhoPlacaMm, bpCm, fm }
export function calcular(input): ResultadoProvaCarga;
export type ResultadoProvaCarga;
```

- [ ] **Step 1: Escrever o teste com a fixture da Situação I**

Situação I: Fz=750 tf (=7355,0 kN), σ(ρ=10mm)=8,1 kgf/cm² (=794,34 kPa), σ(ρ=25mm)=9,3 kgf/cm² (=911,82 kPa), ρp=3,5 mm, Bp=80 cm, FM=1,0. Boston: σadm=mín[σ10; σ25/2].

```ts
// sapata-prova-carga.test.ts
import { describe, it, expect } from "vitest";
import { calcular } from "./sapata-prova-carga";

const KGF = 98.0665;

describe("sapata-prova-carga (Boston, Situação I)", () => {
  it("σadm por Boston, lado B e recalque extrapolado", () => {
    const r = calcular({
      fz: 7355.0,
      sigma10Kpa: 8.1 * KGF,
      sigma25Kpa: 9.3 * KGF,
      rhoPlacaMm: 3.5,
      bpCm: 80,
      fm: 1.0,
    });
    // Boston: min(8,1 ; 9,3/2 = 4,65) = 4,65 kgf/cm²
    expect(r.sigmaAdmKpa).toBeCloseTo(4.65 * KGF, 1);
    expect(r.ladoCm % 10).toBe(0);            // arredondado a 10 cm
    expect(r.ladoCm).toBeGreaterThan(0);
    // Bs = √(4·B²/π) ; ρs = ρp·(Bs/Bp)
    const ladoM = r.ladoCm / 100;
    const bsM = Math.sqrt((4 * ladoM * ladoM) / Math.PI);
    expect(r.bsCm).toBeCloseTo(bsM * 100, 2);
    expect(r.recalqueMm).toBeCloseTo(3.5 * (r.bsCm / 80), 3);
  });

  it("alerta de extrapolação quando B/Bp é grande", () => {
    const r = calcular({ fz: 20000, sigma10Kpa: 200, sigma25Kpa: 400, rhoPlacaMm: 4, bpCm: 80, fm: 1 });
    expect(r.alertaExtrapolacao).toBe(true);
    expect(r.alertas.some((a) => a.includes("extrapola"))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/sapata-prova-carga.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o engine**

Referência: Situação I do arquivo (`sadm=min(s10,s25/2)`, `Bc=√(FM·Fz/σadm)`, `Bs=√(4B²/π)`, `ρs=ρp·Bs/Bp`), reescrito em kN/kPa/m e arredondando B a 10 cm.

```ts
/**
 * Engine E25 — Sapata por prova de carga (ensaio de placa, critério de Boston).
 * NBR 6489 / NBR 6122. Puro. Força kN, tensão kPa, dimensões cm, recalque mm.
 *
 * σadm = mín[σ(ρ=10 mm); σ(ρ=25 mm)/2] (Boston). Lado da sapata quadrada por FM·Fz/σadm.
 * Recalque extrapolado por semelhança de diâmetro equivalente: ρs = ρp·(Bs/Bp), Bs = √(4B²/π).
 */

import { z } from "zod";

export const entradaSchema = z.object({
  fz: z.number().positive(), // kN — carga vertical
  sigma10Kpa: z.number().positive(), // kPa — tensão p/ ρ = 10 mm
  sigma25Kpa: z.number().positive(), // kPa — tensão p/ ρ = 25 mm
  rhoPlacaMm: z.number().positive(), // mm — recalque da placa na σ de trabalho
  bpCm: z.number().positive().default(80), // cm — diâmetro/lado da placa
  fm: z.number().min(1).default(1), // fator de majoração
});
export type EntradaProvaCarga = z.infer<typeof entradaSchema>;
export type EntradaProvaCargaInput = z.input<typeof entradaSchema>;

export type ResultadoProvaCarga = {
  sigmaAdmKpa: number;
  ladoCm: number; // B (quadrada, arredondado a 10 cm)
  bsCm: number; // diâmetro equivalente
  recalqueMm: number; // recalque estimado da sapata
  alertaExtrapolacao: boolean;
  alertas: string[];
};

export function calcular(input: EntradaProvaCargaInput): ResultadoProvaCarga {
  const v = entradaSchema.parse(input);
  const alertas: string[] = [];

  const sigmaAdmKpa = Math.min(v.sigma10Kpa, v.sigma25Kpa / 2);

  const areaM2 = (v.fm * v.fz) / sigmaAdmKpa; // kN / kPa = m²
  const ladoM = Math.ceil(Math.sqrt(areaM2) / 0.1) * 0.1; // arredonda a 10 cm
  const ladoCm = ladoM * 100;

  const bsM = Math.sqrt((4 * ladoM * ladoM) / Math.PI);
  const bsCm = bsM * 100;
  const recalqueMm = v.rhoPlacaMm * (bsCm / v.bpCm);

  const alertaExtrapolacao = ladoCm / v.bpCm > 5;
  if (alertaExtrapolacao) {
    alertas.push(
      "B/Bp > 5: a extrapolação do recalque por semelhança de diâmetro (ρs = ρp·Bs/Bp) perde validade — " +
        "o bulbo de influência da sapata é muito maior que o da placa. Verificar com método de recalque (elástico/fatias).",
    );
  }
  return { sigmaAdmKpa, ladoCm, bsCm, recalqueMm, alertaExtrapolacao, alertas };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/sapata-prova-carga.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/sapata-prova-carga.ts src/modules/ferramentas/calc/sapata-prova-carga.test.ts
git commit -m "feat(ferramentas): sapata por prova de carga (ensaio de placa / Boston)"
```

---

### Task 2: Integração (registry + service + savefile)

**Files:**
- Modify: `src/modules/ferramentas/registry.ts`
- Modify: `src/modules/ferramentas/service.ts`
- Modify: `src/modules/ferramentas/savefile.ts`

**Interfaces:**
- Consumes: `calcular`/`entradaSchema` de `sapata-prova-carga.ts`; `montarMemoriaBase`, `fmtNum` (já em `service.ts`).

- [ ] **Step 1: Registrar em `registry.ts`**

Após `estaca-spt` (ou junto às demais de Fundações), reusando o ícone `Square` (já importado):

```ts
  {
    key: "sapata-prova-carga",
    nome: "Sapata por Prova de Carga",
    descricao: "Pré-dimensiona sapata quadrada por ensaio de placa (critério de Boston, NBR 6489) e estima o recalque por extrapolação da placa. Requer curva tensão × recalque do ensaio.",
    disciplina: "Fundações",
    tipo: "rapida",
    norma: "NBR 6489 / NBR 6122",
    exportaveis: ["pdf", "xlsx"],
    icon: Square,
  },
```

- [ ] **Step 2: `savefile.ts` — import + entrada no map**

```ts
import { entradaSchema as provaCargaSchema } from "./calc/sapata-prova-carga";
```

No `ENTRADAS_SCHEMAS`:

```ts
  "sapata-prova-carga": provaCargaSchema,
```

- [ ] **Step 3: `service.ts` — import**

```ts
import { calcular as calcularProvaCarga, entradaSchema as provaCargaSchema } from "./calc/sapata-prova-carga";
```

- [ ] **Step 4: `service.ts` — `case` em `calcular`**

Antes do `default:` do `switch` de `calcular`:

```ts
    case "sapata-prova-carga": {
      const r = calcularProvaCarga(provaCargaSchema.parse(entradas));
      return {
        campos: {
          "σadm (kPa)": fmtNum(r.sigmaAdmKpa, 0),
          "B (cm)": r.ladoCm,
          "ρ sapata (mm)": fmtNum(r.recalqueMm, 2),
        },
        alertas: r.alertas,
      };
    }
```

- [ ] **Step 5: `service.ts` — `case` em `montarMemoria` + builder**

No `switch` de `montarMemoria`, antes do `default:`:

```ts
    case "sapata-prova-carga":
      return memoriaProvaCarga(entradas, base);
```

Builder (junto às demais `memoria*`):

```ts
function memoriaProvaCarga(entradas: Record<string, unknown>, base: BaseArgs): MemoriaDoc {
  const e = provaCargaSchema.parse(entradas);
  const r = calcularProvaCarga(e);
  return montarMemoriaBase({
    ...base,
    secoes: [
      {
        titulo: "Tensão admissível (critério de Boston)",
        valores: [
          { descricao: "σ para ρ = 10 mm", valor: fmtNum(e.sigma10Kpa, 0), unidade: "kPa" },
          { descricao: "σ para ρ = 25 mm", valor: fmtNum(e.sigma25Kpa, 0), unidade: "kPa" },
          { descricao: "Tensão admissível", simbolo: "σadm", valor: fmtNum(r.sigmaAdmKpa, 0), unidade: "kPa", formula: "mín[σ(ρ=10 mm); σ(ρ=25 mm)/2]" },
        ],
      },
      {
        titulo: "Dimensionamento e recalque",
        valores: [
          { descricao: "Lado da sapata quadrada", simbolo: "B", valor: r.ladoCm, unidade: "cm", formula: "√(FM·Fz/σadm)" },
          { descricao: "Diâmetro equivalente", simbolo: "Bs", valor: fmtNum(r.bsCm, 1), unidade: "cm", formula: "√(4·B²/π)" },
          { descricao: "Recalque estimado", simbolo: "ρs", valor: fmtNum(r.recalqueMm, 2), unidade: "mm", formula: "ρp·(Bs/Bp)" },
        ],
        notas: r.alertas,
      },
    ],
  });
}
```

- [ ] **Step 6: Rodar suíte + lint; commit**

Run: `npm test && npm run lint`
Expected: tudo verde.

```bash
git add src/modules/ferramentas/registry.ts src/modules/ferramentas/service.ts src/modules/ferramentas/savefile.ts
git commit -m "feat(ferramentas): integra sapata-prova-carga (registry/service/savefile/memória)"
```

---

## Self-Review

- **Cobertura:** Situação I → Tasks 1-2. ✔
- **Consistência de tipos:** `calcularProvaCarga`/`provaCargaSchema` importados na integração com os nomes exportados na Task 1; `ResultadoProvaCarga` usado só internamente. ✔
- **Placeholders:** nenhum — todo passo tem código completo. ✔
- **Dependências:** nenhuma externa (não usa perfil de solo nem o campo `imagens`). ✔
