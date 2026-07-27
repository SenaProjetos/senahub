# Enriquecimentos da Sapata Excêntrica (Situações V e VI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender o engine existente `eccentric-footing.ts` (E22, chave `sapata-excentrica`) com (V) força horizontal + verificação de segurança ao deslizamento e correlações c/φ por SPT, e (VI) um preset de sapata de divisa por excentricidade geométrica — sem criar ferramenta nova.

**Architecture:** Ambas as situações são o mesmo modelo físico do modo `isolada` já existente (`e → σmax/σmin`). A Situação V acrescenta campos **opcionais** ao `isoladaSchema` (não quebra chamadas atuais) e um sub-objeto de resultado. A Situação VI é um **helper puro de conversão de entrada** (`divisaParaIsolada`) que devolve os inputs equivalentes ao modo isolada.

**Tech Stack:** TypeScript, Zod, Vitest (node env).

**Origem:** Fase 5 do estudo comparativo `docs/calculadoras` × `ferramentas` (conselho de subagentes, 2026-07). Situações V (linhas 360-385) e VI (linhas 386-405) do arquivo de referência.

## Global Constraints

- Alterar **apenas** `eccentric-footing.ts` + seu teste (e a apresentação em `service.ts`, opcional). Manter todos os campos novos **opcionais** — chamadas existentes ao modo isolada devem continuar válidas sem mudança.
- Correlações c/φ (Alonso/Douglas/Teixeira & Godoy) são **estimativa opcional**: só calculam deslizamento quando `fx` é informado; emitir alerta de faixa de validade; capar (`c ≤ 25 kPa`, `φ ≤ 35°`).
- FS mínimo por tipo de solo: **1,5 (areia) / 2,0 (argila)** — não fixo em 2 como no arquivo.
- Unidades nativas: força **kN**, momento **kN·m**, tensão **kPa**, dimensões **cm**, profundidade **m**.
- `versaoCalc` da `sapata-excentrica`: **incrementar** ao final (o resultado do modo isolada ganha o campo `deslizamento`, mas os valores existentes não mudam — ainda assim, boa prática incrementar por mudança de contrato de saída).
- `npm run lint` + `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts` verdes antes de cada commit.

## File Structure

- `src/modules/ferramentas/calc/eccentric-footing.ts` — modificado: `isoladaSchema` ganha `fx?/z?/tipoSolo?/nspt?`; `ResultadoIsolada` ganha `deslizamento?`; novo helper `divisaParaIsolada`.
- `src/modules/ferramentas/calc/eccentric-footing.test.ts` — novos casos (V e VI).
- `src/modules/ferramentas/service.ts` — opcional: exibir FS de deslizamento no painel/memória.

---

### Task 1: Situação V — força horizontal + deslizamento + correlações c/φ

**Files:**
- Modify: `src/modules/ferramentas/calc/eccentric-footing.ts` (`isoladaSchema` ~linha 24-36; `ResultadoIsolada` ~linha 56-67; `calcularIsolada` ~linha 102-148)
- Modify: `src/modules/ferramentas/calc/eccentric-footing.test.ts`

**Interfaces:**
- Consumes: nada novo (tudo interno ao engine).
- Produces: campos opcionais `fx?`, `z?`, `tipoSoloDeslizamento?`, `nsptDeslizamento?` no `isoladaSchema`; sub-objeto `deslizamento?: { c; phi; a; tanDelta; sigmaV; fat; fh; fs; fsMin; ok }` em `ResultadoIsolada`.

- [ ] **Step 1: Escrever o teste com a fixture Situação V**

Situação V: Fz=30 tf (=294,20 kN), Fx=1,5 tf (=14,71 kN), My=4 tf·m (=39,23 kN·m), z=1,2 m, N=10, B=240 cm, L=100 cm, FM não se aplica ao engine (o engine já usa Nk direto). Correlações: c=mín(N,25)=10 kPa; φ=mín(√(20·10)+15,35)=29,14°; a=0,5c; tanδ=⅔·tanφ.

```ts
// eccentric-footing.test.ts
import { describe, it, expect } from "vitest";
import { calcular } from "./eccentric-footing";

describe("eccentric-footing / isolada — deslizamento (Situação V)", () => {
  it("sem fx: não calcula deslizamento", () => {
    const r = calcular({ modo: "isolada", nk: 294.2, mk: 39.23, a: 240, b: 100, ap: 40, sigmaAdm: 196, h: 40, fck: 25, aco: "CA-50" });
    if (r.modo !== "isolada") throw new Error("modo");
    expect(r.deslizamento).toBeUndefined();
  });

  it("com fx e correlações por SPT: FS ao deslizamento", () => {
    const r = calcular({
      modo: "isolada", nk: 294.2, mk: 39.23, a: 240, b: 100, ap: 40,
      sigmaAdm: 196, h: 40, fck: 25, aco: "CA-50",
      fx: 14.71, z: 1.2, nsptDeslizamento: 10, tipoSoloDeslizamento: "argila",
    });
    if (r.modo !== "isolada" || !r.deslizamento) throw new Error("faltou deslizamento");
    const d = r.deslizamento;
    expect(d.c).toBeCloseTo(10, 6);                    // mín(N,25)
    expect(d.phi).toBeCloseTo(Math.min(Math.sqrt(20 * 10) + 15, 35), 4);
    expect(d.a).toBeCloseTo(0.5 * d.c, 6);             // adesão
    expect(d.tanDelta).toBeCloseTo((2 / 3) * Math.tan((d.phi * Math.PI) / 180), 6);
    expect(d.fsMin).toBe(2.0);                         // argila
    expect(d.fs).toBeGreaterThan(0);
    expect(typeof d.ok).toBe("boolean");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts -t "deslizamento"`
Expected: FAIL (`fx`/`deslizamento` não existem).

- [ ] **Step 3: Estender `isoladaSchema` com campos opcionais**

Adicionar ao `isoladaSchema` (após `dLinha`):

```ts
  fx: z.number().min(0).optional(), // kN — força horizontal (habilita a verificação ao deslizamento)
  z: z.number().positive().optional(), // m — profundidade de assentamento (p/ excentricidade de Fx)
  nsptDeslizamento: z.number().min(0).optional(), // N-SPT p/ estimar c e φ (opcional)
  tipoSoloDeslizamento: z.enum(["areia", "argila"]).optional(), // define o FS mínimo (1,5 / 2,0)
```

- [ ] **Step 4: Estender `ResultadoIsolada`**

Adicionar o campo opcional ao tipo `ResultadoIsolada` (após `situacao`):

```ts
  deslizamento?: {
    c: number; // kPa (adesão do solo, capado)
    phi: number; // ° (ângulo de atrito, capado)
    a: number; // kPa (adesão na base = 0,5·c)
    tanDelta: number; // ⅔·tanφ
    sigmaV: number; // kPa (tensão vertical média na base)
    fat: number; // kN (força resistente ao deslizamento)
    fh: number; // kN (força horizontal solicitante)
    fs: number; // fator de segurança
    fsMin: number; // FS mínimo exigido (1,5 areia / 2,0 argila)
    ok: boolean;
  };
```

- [ ] **Step 5: Calcular o deslizamento em `calcularIsolada`**

No fim de `calcularIsolada`, antes do `return`, calcular `deslizamento` quando `fx` for informado. Nota: se `mk` não considerar `Fx·z`, adicionar essa parcela à excentricidade quando `fx`/`z` forem dados (coerente com a Situação V: `e = (My + Fx·z)/Fz`). Como `calcularIsolada` já derivou `e` de `mk/nk`, aqui só acrescentamos a verificação de deslizamento (a excentricidade adicional por Fx pode ser embutida pelo usuário no `mk`; documentar isso).

```ts
  let deslizamento: ResultadoIsolada["deslizamento"];
  if (v.fx != null && v.fx > 0) {
    const n = v.nsptDeslizamento ?? 0;
    const c = Math.min(n, 25); // kPa (Douglas: c = N, capado)
    const phi = Math.min(Math.sqrt(20 * n) + 15, 35); // ° (Teixeira & Godoy, capado)
    const aAd = 0.5 * c; // adesão na base (Terzaghi)
    const tanDelta = (2 / 3) * Math.tan((phi * Math.PI) / 180);
    const areaBaseM2 = (v.a / 100) * (v.b / 100);
    const sigmaV = (0.5 * v.nk) / areaBaseM2; // kPa — tensão vertical média (0,5·N, a favor da segurança)
    const fat = (aAd + sigmaV * tanDelta) * areaBaseM2; // kN
    const fh = v.fx; // kN
    const fs = fh > 0 ? fat / fh : Infinity;
    const fsMin = v.tipoSoloDeslizamento === "areia" ? 1.5 : 2.0;
    const ok = fs >= fsMin;
    if (n === 0) alertas.push("Deslizamento: N-SPT não informado — c e φ estimados como 0. Informe N ou c/φ de laudo.");
    if (n > 20) alertas.push("Correlações c/φ por SPT têm validade prática até N ≈ 20 — valores capados.");
    if (!ok) alertas.push(`FS ao deslizamento (${fs.toFixed(2)}) < FS mínimo (${fsMin.toFixed(1)}): prever chave de cisalhamento ou aumentar a base.`);
    deslizamento = { c, phi, a: aAd, tanDelta, sigmaV, fat, fh, fs, fsMin, ok };
  }
```

E incluir `deslizamento` no objeto de retorno de `calcularIsolada`:

```ts
  return {
    modo: "isolada",
    e, emax, descola, sigmaMax, sigmaMin, sigmaOk, asA,
    alertas,
    situacao: sigmaOk && !arm.excede && (deslizamento?.ok ?? true) ? "ok" : "revisar",
    deslizamento,
  };
```

(remover a antiga linha `situacao:` e substituir pela acima, que também reprova se o deslizamento falhar.)

- [ ] **Step 6: Rodar e ver passar; suíte do engine verde**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts`
Expected: PASS (novos + antigos).

- [ ] **Step 7: Commit**

```bash
git add src/modules/ferramentas/calc/eccentric-footing.ts src/modules/ferramentas/calc/eccentric-footing.test.ts
git commit -m "feat(ferramentas): verificação de deslizamento (Fx, c/φ por SPT) na sapata excêntrica"
```

---

### Task 2: Situação VI — preset de sapata de divisa (excentricidade geométrica)

Helper puro que converte os dados de divisa (Fz, pilar b, afastamento a, σadm) nas entradas equivalentes do modo `isolada`, aplicando `B ≤ 1,5b + 3a` e `e = B/2 − a − b/2`.

**Files:**
- Modify: `src/modules/ferramentas/calc/eccentric-footing.ts` (novo export `divisaParaIsolada`)
- Modify: `src/modules/ferramentas/calc/eccentric-footing.test.ts`

**Interfaces:**
- Produces: `export function divisaParaIsolada(args: { fzKn; bCm; aCm; sigmaAdmKpa; hCm?; fck?; aco? }): EntradaExcInput` — retorna um input do modo `isolada` com `a` (=B calculado) e `mk` equivalente à excentricidade geométrica.

- [ ] **Step 1: Escrever o teste com a fixture Situação VI**

Situação VI: Fz=10 tf (=98,07 kN), b=40 cm, a=3 cm, σadm=3,0 kgf/cm² (=294,20 kPa). `Bmax=1,5·40+3·3=69 → B=60 cm` (arredonda p/ baixo a 10 cm); `e=B/2−a−b/2=30−3−20=7 cm`.

```ts
import { divisaParaIsolada, calcular } from "./eccentric-footing";

describe("eccentric-footing / divisa (Situação VI)", () => {
  it("converte dados de divisa em entrada do modo isolada", () => {
    const entrada = divisaParaIsolada({ fzKn: 98.07, bCm: 40, aCm: 3, sigmaAdmKpa: 294.2 });
    // B = floor((1,5·40 + 3·3)/10)·10 = floor(69/10)·10 = 60 cm
    expect(entrada.a).toBe(60);
    // e = B/2 − a − b/2 = 7 cm → mk = Nk·e = 98,07·0,07 kN·m
    const eCm = 60 / 2 - 3 - 40 / 2;
    expect(entrada.mk).toBeCloseTo(98.07 * (eCm / 100), 4);
    // e alimenta o modo isolada sem descolamento (e ≤ a/6 = 10 cm)
    const r = calcular(entrada);
    if (r.modo !== "isolada") throw new Error("modo");
    expect(r.descola).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts -t "divisa"`
Expected: FAIL (`divisaParaIsolada` não existe).

- [ ] **Step 3: Implementar o helper**

Adicionar ao final de `eccentric-footing.ts`:

```ts
/**
 * Preset "sapata de divisa" (Situação VI): converte afastamento à divisa em entrada do modo isolada.
 * B ≤ 1,5·b + 3·a (garante σmin ≥ 0); e = B/2 − a − b/2 → mk = Nk·e.
 * b_perpendicular (b da isolada) é estimado; o usuário refina depois se necessário.
 */
export function divisaParaIsolada(args: {
  fzKn: number;
  bCm: number; // pilar (dir. do afastamento)
  aCm: number; // afastamento à divisa
  sigmaAdmKpa: number;
  hCm?: number;
  fck?: number;
  aco?: "CA-25" | "CA-50" | "CA-60";
}): EntradaExcInput {
  const bMaxCm = 1.5 * args.bCm + 3 * args.aCm;
  const bDivisaCm = Math.floor(bMaxCm / 10) * 10; // = "a" da sapata (dir. do momento)
  const eCm = bDivisaCm / 2 - args.aCm - args.bCm / 2;
  const mkKnM = args.fzKn * (eCm / 100); // kN·m
  // dimensão perpendicular por área requerida (estimativa inicial, arredondada a 10 cm)
  const areaReqM2 = args.fzKn / args.sigmaAdmKpa;
  const bPerpCm = Math.max(Math.ceil((areaReqM2 / (bDivisaCm / 100)) * 100 / 10) * 10, args.bCm + 10);
  return {
    modo: "isolada",
    nk: args.fzKn,
    mk: mkKnM,
    a: bDivisaCm,
    b: bPerpCm,
    ap: args.bCm,
    sigmaAdm: args.sigmaAdmKpa,
    h: args.hCm ?? 40,
    fck: args.fck ?? 25,
    aco: args.aco ?? "CA-50",
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/eccentric-footing.ts src/modules/ferramentas/calc/eccentric-footing.test.ts
git commit -m "feat(ferramentas): preset de sapata de divisa (excentricidade geométrica)"
```

---

### Task 3: Exibir deslizamento no painel/memória + bump de versão (opcional, mas recomendado)

**Files:**
- Modify: `src/modules/ferramentas/service.ts` (`calcular` case `sapata-excentrica` modo isolada; `memoriaSapataExcentrica`)

- [ ] **Step 1: Acrescentar FS ao deslizamento no painel**

No `case "sapata-excentrica"` de `calcular`, ramo `r.modo === "isolada"`, incluir o FS quando existir:

```ts
        const campos: Record<string, string | number> = {
          e: fmtNum(r.e, 1),
          "a/6": fmtNum(r.emax, 1),
          "σmax": fmtNum(r.sigmaMax, 0),
          "σmin": fmtNum(r.sigmaMin, 0),
          descola: r.descola ? "sim" : "não",
          "As(a)": fmtNum(r.asA, 2),
        };
        if (r.deslizamento) campos["FS desliz."] = fmtNum(r.deslizamento.fs, 2);
        return { campos, alertas: r.alertas };
```

(substituir o objeto de retorno atual do ramo isolada por este bloco `const campos … return`.)

- [ ] **Step 2: Acrescentar seção de deslizamento na memória**

Em `memoriaSapataExcentrica`, no ramo isolada, adicionar uma seção condicional quando `r.deslizamento` existir:

```ts
    ...(r.deslizamento
      ? [{
          titulo: "Verificação ao deslizamento",
          valores: [
            { descricao: "Adesão do solo", simbolo: "c", valor: fmtNum(r.deslizamento.c, 1), unidade: "kPa" },
            { descricao: "Ângulo de atrito", simbolo: "φ", valor: fmtNum(r.deslizamento.phi, 1), unidade: "°" },
            { descricao: "Força resistente", simbolo: "Fat", valor: fmtNum(r.deslizamento.fat, 1), unidade: "kN", formula: "(a + σv·tanδ)·A" },
            { descricao: "Força horizontal", simbolo: "FH", valor: fmtNum(r.deslizamento.fh, 1), unidade: "kN" },
            { descricao: "Fator de segurança", simbolo: "FS", valor: fmtNum(r.deslizamento.fs, 2), formula: `≥ ${r.deslizamento.fsMin.toFixed(1)}` },
          ],
        }]
      : []),
```

(inserir o spread no array `secoes` do ramo isolada.)

- [ ] **Step 3: Incrementar `versaoCalc` da sapata-excentrica**

Localizar onde a versão da ferramenta `sapata-excentrica` é definida (buscar o valor passado a `snapshotParaSalvar`/`versaoCalc` na camada de action; hoje `1`) e incrementar para `2`, documentando no commit que o contrato de saída do modo isolada ganhou o campo `deslizamento`.

- [ ] **Step 4: Rodar suíte + lint; commit**

Run: `npm test && npm run lint`
Expected: verde.

```bash
git add src/modules/ferramentas/service.ts
git commit -m "feat(ferramentas): exibe FS ao deslizamento no painel e memória da sapata excêntrica"
```

---

## Self-Review

- **Cobertura:** V → Task 1; VI → Task 2; apresentação → Task 3. ✔
- **Retrocompatibilidade:** todos os campos novos do `isoladaSchema` são `.optional()`; `deslizamento` é opcional em `ResultadoIsolada`; chamadas atuais permanecem válidas. ✔
- **Consistência de tipos:** `deslizamento` definido na Task 1 e consumido na Task 3; `EntradaExcInput` (retorno de `divisaParaIsolada`) é o tipo de entrada já exportado pelo engine. ✔
- **FS por tipo de solo** (1,5/2,0), não fixo em 2. ✔
- **Placeholders:** nenhum. ✔
- **Nota:** a excentricidade adicional de Fx (`Fx·z`) deve ser embutida pelo usuário no `mk` (documentado no Step 5 da Task 1); se preferir automatizar, é uma extensão futura — não incluída para manter o contrato do modo isolada estável.
