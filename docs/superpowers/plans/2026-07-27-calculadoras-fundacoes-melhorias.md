# Melhorias das Calculadoras de Fundações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as lacunas identificadas pelo conselho no comparativo `docs/calculadoras` × módulo `ferramentas`, priorizando a frente **geotécnica de recalque** (inexistente hoje) e melhorias de relatório, sem regredir nada do que já existe.

**Architecture:** Reaproveita integralmente o "molde" do módulo `src/modules/ferramentas/` (engine puro em `calc/` + teste → registro em `registry.ts` → despacho em `service.ts` → schema portátil em `savefile.ts` → memória em `MemoriaDoc`). Nenhuma migração Prisma nova é necessária — o pipeline `actions.ts`/`auto-store.ts`/`CalculoFerramenta` é genérico por chave. Perfis de solo entram como `camadas[]` local (padrão já validado por `calc/pile-spt.ts`), extraído para um schema compartilhado.

**Tech Stack:** TypeScript, Zod, Vitest (node env), React 19 client components, `@/lib/dxf` (writer DXF R12), puppeteer-core (PDF), Prisma 7 (client em `@/generated/prisma/client`).

**Origem:** Estudo comparativo conduzido por conselho de 4 subagentes (Inventário, Metodologia, Gráfico/UX, Arquitetura) em 2026-07-26/27. O arquivo `docs/calculadoras` é material didático de terceiros (Prof. MSc. Douglas M. A. Bittencourt / IPOG) — usar como **referência de método e fonte de fixtures de teste**, reimplementando a partir das normas ABNT; **não copiar código literalmente**.

## Global Constraints

- **Engines são puros e testados:** cada `calc/<key>.ts` sem I/O, sem Next, sem Prisma; cada um com `calc/<key>.test.ts` (vitest, `src/**/*.test.ts`, node env).
- **Unidades nativas do módulo:** comprimento **cm** nas dimensões de peça, **m** em perfis de solo/profundidade, força **kN**, momento **kN·m**, tensão **kPa (kN/m²)**, armadura **cm²**. Igual a `footing.ts`/`eccentric-footing.ts`/`pile-spt.ts`. Inputs do usuário nessas unidades — nada de tf/kgf·cm² internos.
- **Conversões só para montar fixtures a partir do arquivo-fonte:** `1 tf = 9,80665 kN`; `1 kgf/cm² = 98,0665 kPa`; `1 tf/m² = 9,80665 kPa`. Documentar como comentário no teste que usa números do arquivo.
- **Correlações empíricas são atalho OPCIONAL, nunca método primário.** σadm/c/φ de laudo geotécnico continuam sendo a entrada de projeto (padrão `footing.ts`). Toda correlação (Alonso, Boston, Teixeira & Godoy, Douglas, Skempton–Bjerrum) deve emitir alerta de faixa de validade e alimentar um campo sempre editável.
- **Zero valor de solo hardcoded.** Perfis de SPT/Es/Cc/e0/cv vêm de `camadas[]`/inputs do schema Zod — nunca arrays fixos do exemplo didático (erro das Situações II e VIII do arquivo).
- **Chaves de `registry.ts` são estáveis e permanentes** assim que um `CalculoFerramenta` for salvo. Nomear com cuidado. Novas chaves reservadas: `sapata-prova-carga` (E25), `sapata-spt` (E26), `sapata-associada` (E27), `recalque-fundacao` (E28). **Não** reusar E22/E24 do roadmap antigo.
- **`versaoCalc`** começa em `1`; ao corrigir uma fórmula depois de publicada, incrementar (não reinterpretar snapshots antigos silenciosamente).
- **Superfície de integração de cada engine novo = 4 pontos mecânicos:** `registry.ts` (metadado) + `calc/<key>.ts`(+test) + `service.ts` (`calcular` e `montarMemoria`) + `savefile.ts` (`ENTRADAS_SCHEMAS`). Nenhum toque em `actions.ts`, `auto-store.ts`, `schema.prisma`.
- **Código em inglês, UI/strings em pt-BR, commits Conventional em pt-BR.**
- **Prisma:** importar de `@/generated/prisma/client`, nunca de `@prisma/client`.
- **Prova de execução:** `npm run lint` e `npm test` (ou `npx vitest run <arquivo>`) verdes antes de cada commit; não rodar `next build` com `next dev` ativo.

---

## Fases (independentes e entregáveis separadamente)

- **Fase 0 — Quick wins & correções** (contraste dark-mode; fator de alívio de segurança; validação sem código de III/VI/VII).
- **Fase 1 — Fundação gráfica dos relatórios** (campo de imagem na memória; diagrama de tensão-no-solo; cabeçalho técnico ART/CREA).
- **Fase 2 — Perfil de solo compartilhado + `sapata-spt`** (Alonso + bulbo, Situação II).
- **Fase 3 — `recalque-fundacao`** (Situações VIII/IX/X/XI — a maior lacuna de engenharia).
- **Fase 4 — `sapata-prova-carga`** (ensaio de placa / Boston, Situação I).
- **Fase 5 — Enriquecimentos** (deslizamento na sapata excêntrica — Situação V; preset de divisa — Situação VI).
- **Fase 6 — `sapata-associada`** (2 pilares + viga de rigidez + DEC/DMF, Situação IV — a maior, por último).

Cada fase produz software funcional e testável por si. A ordem recomendada de entrega é 0 → 1 → 2 → 3, com 4/5/6 encaixáveis quando houver demanda.

---

## FASE 0 — Quick wins & correções

### Task 0.0: Validar III / VI / VII contra os engines existentes (sem código de produção)

Confirma que Situações III (sapata isolada), VI (sapata de divisa) e VII (viga alavanca) já são cobertas por `footing.ts`/`eccentric-footing.ts` — fechando 3 dos 11 itens sem construir nada. Materializa a conferência como testes de caracterização.

**Files:**
- Test: `src/modules/ferramentas/calc/footing.test.ts` (adicionar casos)
- Test: `src/modules/ferramentas/calc/eccentric-footing.test.ts` (adicionar casos)

**Interfaces:**
- Consumes: `calcular` de `footing.ts` e `eccentric-footing.ts` (assinaturas existentes).
- Produces: nada para tarefas posteriores (só cobertura).

- [ ] **Step 1: Escrever teste de caracterização (Situação VII → modo viga_equilibrio)**

O conselho de Metodologia confirmou algebricamente que `R1 = P1·x/(x−e)` (SenaHub) ≡ `R1 = P1 + P1·e/d` com `d = x−e` (arquivo). Usar os números da Situação VII (P1=40 tf, P2=160 tf, x=300 cm, a=5 cm, b1=20 cm, σadm=2,0 kgf/cm²) convertidos para as unidades nativas.

```ts
// eccentric-footing.test.ts — Situação VII do docs/calculadoras (viga alavanca).
// Conversões: 40 tf = 392,266 kN; 160 tf = 1569,064 kN; 2,0 kgf/cm² = 196,133 kPa.
import { describe, it, expect } from "vitest";
import { calcular } from "./eccentric-footing";

describe("eccentric-footing / viga_equilibrio (caracterização Situação VII)", () => {
  it("R1 = P1·ℓ/(ℓ−e) coerente com a formulação incremental do material de referência", () => {
    const r = calcular({
      modo: "viga_equilibrio",
      p1: 392.266, p2: 1569.064,
      ell: 300, ap1: 20, a1: 100,
      sigmaAdm: 196.133, fck: 25, aco: "CA-50",
    });
    if (r.modo !== "viga_equilibrio") throw new Error("modo inesperado");
    // e = (a1 − ap1)/2 = 40 cm → R1 = P1·300/(300−40) = P1·1,1538
    expect(r.e).toBeCloseTo(40, 6);
    expect(r.r1).toBeCloseTo(392.266 * 300 / (300 - 40), 2);
    expect(r.deltaP2).toBeCloseTo(r.r1 - 392.266, 2);
  });
});
```

- [ ] **Step 2: Rodar e ver passar (é caracterização do comportamento atual)**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts -t "Situação VII"`
Expected: PASS.

- [ ] **Step 3: Escrever teste de caracterização (Situação III → footing.ts)**

Confirma que sapata isolada centrada é coberta. Situação III: Fz=250 tf, pilar 60×25 cm, fck=30, σadm=3,0 kgf/cm². Converter: 250 tf = 2451,66 kN; 3,0 kgf/cm² = 294,20 kPa. Verificar apenas grandezas de existência (área/rigidez/armadura ≠ null), não os números do método das bielas do arquivo (o SenaHub usa rota formal, mais rigorosa — divergência esperada e desejada).

```ts
// footing.test.ts — caracterização Situação III (existência de cobertura).
import { calcular as calcularSapata } from "./footing";
it("cobre sapata isolada centrada da Situação III (grandezas presentes)", () => {
  const r = calcularSapata({ nk: 2451.66, sigmaAdm: 294.20, ap: 60, bp: 25, h: 60, fck: 30, aco: "CA-50" });
  expect(r.a).toBeGreaterThan(0);
  expect(r.b).toBeGreaterThan(0);
  expect(r.asAporM).toBeGreaterThan(0);
});
```

> Nota: os nomes de campo de entrada/saída de `footing.ts` (`nk`, `ap`, `bp`, `sigmaAdm`, `a`, `b`, `asAporM`, `sigmaSolo`) devem ser confirmados abrindo `src/modules/ferramentas/calc/footing.ts` antes de rodar; ajustar o teste ao contrato real caso divirja.

- [ ] **Step 4: Rodar ambos e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/footing.test.ts src/modules/ferramentas/calc/eccentric-footing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ferramentas/calc/footing.test.ts src/modules/ferramentas/calc/eccentric-footing.test.ts
git commit -m "test(ferramentas): caracteriza cobertura das Situações III e VII de fundações"
```

---

### Task 0.1: Corrigir contraste do preview DXF no dark mode

Bug cosmético (só preview de tela, não afeta export): cor ACI 7 = `#1f2937` (quase preto) sobre `dark:bg-zinc-900` fica quase invisível.

**Files:**
- Modify: `src/components/ferramentas/dxf-preview.tsx:13-17`

- [ ] **Step 1: Trocar o fallback da cor ACI 7 por um cinza médio com contraste nos dois fundos**

Substituir o mapa `ACI` e o fallback de `cor()`:

```tsx
/** Cores ACI básicas → hex (para o preview). 7 = cinza médio (legível em fundo claro e escuro). */
const ACI: Record<number, string> = {
  1: "#dc2626", 2: "#ca8a04", 3: "#16a34a", 4: "#0891b2",
  5: "#2563eb", 6: "#9333ea", 7: "#64748b",
};
const cor = (camadas: ReadonlyMap<string, number>, nome: string) => ACI[camadas.get(nome) ?? 7] ?? "#64748b";
```

- [ ] **Step 2: Verificação visual + lint**

Run: `npm run lint`
Expected: sem erros. Conferir na UI (qualquer ferramenta com DXF, ex. `sapata-isolada`) que o desenho fica legível no tema escuro.

- [ ] **Step 3: Commit**

```bash
git add src/components/ferramentas/dxf-preview.tsx
git commit -m "fix(ferramentas): contraste do preview DXF no tema escuro (cor ACI 7)"
```

---

### Task 0.2: Expor fator de alívio (`pctAlivio`) na viga de equilíbrio — correção de segurança

`eccentric-footing.ts` dimensiona a sapata de reação com **100% do alívio** (`r2 = p2 − deltaP2`), a hipótese **menos conservadora**. A prática de projeto usa 50% (ou 0%, a favor da segurança). Expor um fator opcional, com default conservador de 50%.

**Files:**
- Modify: `src/modules/ferramentas/calc/eccentric-footing.ts:38-50` (schema) e `:150-165` (cálculo de r2)
- Test: `src/modules/ferramentas/calc/eccentric-footing.test.ts`

**Interfaces:**
- Produces: campo de entrada `pctAlivio?: number` (0..1, default 0.5) no `vigaSchema`; `r2 = p2 − pctAlivio·deltaP2`.

- [ ] **Step 1: Escrever o teste do novo parâmetro (falha antes da mudança)**

```ts
it("aplica fator de alívio parcial (default 50%) na sapata de reação", () => {
  const base = { modo: "viga_equilibrio", p1: 400, p2: 1600, ell: 300, ap1: 20, a1: 100, sigmaAdm: 200, fck: 25, aco: "CA-50" } as const;
  const meio = calcular({ ...base }); // default 50%
  const cheio = calcular({ ...base, pctAlivio: 1 }); // comportamento antigo
  if (meio.modo !== "viga_equilibrio" || cheio.modo !== "viga_equilibrio") throw new Error("modo");
  // r2(50%) = p2 − 0,5·ΔP  >  r2(100%) = p2 − ΔP  (default é mais conservador → sapata interna maior)
  expect(meio.r2).toBeGreaterThan(cheio.r2);
  expect(meio.r2).toBeCloseTo(base.p2 - 0.5 * meio.deltaP2, 6);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts -t "fator de alívio"`
Expected: FAIL (`pctAlivio` não existe / r2 usa 100%).

- [ ] **Step 3: Adicionar o campo ao schema e usar no cálculo**

Em `vigaSchema` (após `hViga`):

```ts
  pctAlivio: z.number().min(0).max(1).default(0.5), // fração do alívio teórico aplicada em R2 (0=seguro, 1=teórico)
```

Em `calcularViga2`, trocar a linha `const r2 = v.p2 - deltaP2;` por:

```ts
  const r2 = v.p2 - v.pctAlivio * deltaP2; // alívio parcial (default 50%, conservador vs. 100% teórico)
```

- [ ] **Step 4: Rodar e ver passar; conferir que a suíte inteira do engine continua verde**

Run: `npx vitest run src/modules/ferramentas/calc/eccentric-footing.test.ts`
Expected: PASS (incluindo os testes pré-existentes; ajustar quaisquer testes antigos que assumiam 100% de alívio, incrementando a expectativa para o novo default e documentando a mudança).

- [ ] **Step 5: Bump de `versaoCalc` da sapata-excêntrica e commit**

Localizar onde `sapata-excentrica` define `versaoCalc` (buscar em `service.ts`/`actions.ts` a constante de versão da ferramenta) e incrementá-la, pois o resultado default muda.

```bash
git add src/modules/ferramentas/calc/eccentric-footing.ts src/modules/ferramentas/calc/eccentric-footing.test.ts
git commit -m "fix(ferramentas): fator de alívio parcial (default 50%) na viga de equilíbrio"
```

---

## FASE 1 — Fundação gráfica dos relatórios

### Task 1.1: Campo de imagem/gráfico no `MemoriaSecao` + render no HTML/PDF

Hoje `MemoriaDoc` não tem campo de imagem e o PDF exportado sai **sem nenhum desenho**. Adicionar suporte a SVG inline, consumido por `render-html.ts` (que alimenta o PDF via puppeteer). `render-docx.ts`/`render-xlsx.ts` **ignoram** o campo por ora (rasterização fica para uma fase futura, quando uma ferramenta exigir gráfico no Word/Excel).

**Files:**
- Modify: `src/modules/ferramentas/memoria/types.ts:27-33` (tipo `MemoriaSecao`)
- Modify: `src/modules/ferramentas/memoria/render-html.ts:32-55` (função `secaoHtml`)
- Test: `src/modules/ferramentas/memoria/render-html.test.ts` (criar se não existir)

**Interfaces:**
- Produces: tipo `MemoriaImagem = { titulo?: string; svg: string }`; campo `MemoriaSecao.imagens?: MemoriaImagem[]`. Renderizado como bloco `<figure>` dentro da `<section>`.

- [ ] **Step 1: Escrever o teste do render (falha antes)**

```ts
// render-html.test.ts
import { describe, it, expect } from "vitest";
import { renderMemoriaHtml } from "./render-html";

describe("renderMemoriaHtml — imagens de seção", () => {
  it("injeta o SVG inline da seção no HTML", () => {
    const html = renderMemoriaHtml({
      ferramenta: "x", titulo: "T", geradoEm: new Date().toISOString(), disclaimer: "d",
      secoes: [{ titulo: "Diagrama", imagens: [{ titulo: "Tensões", svg: "<svg id=\"probe\"></svg>" }] }],
    });
    expect(html).toContain("id=\"probe\"");
    expect(html).toContain("Tensões");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/memoria/render-html.test.ts`
Expected: FAIL (SVG não aparece; `imagens` não existe no tipo).

- [ ] **Step 3: Adicionar o tipo**

Em `memoria/types.ts`, antes de `MemoriaSecao`:

```ts
/** Um gráfico/desenho embutido na memória (SVG inline; usado no HTML/PDF). */
export type MemoriaImagem = {
  titulo?: string;
  /** Markup <svg>…</svg> autocontido. NÃO é escapado — deve ser gerado internamente, nunca a partir de input do usuário. */
  svg: string;
};
```

E acrescentar o campo em `MemoriaSecao`:

```ts
export type MemoriaSecao = {
  titulo: string;
  paragrafos?: string[];
  valores?: MemoriaValor[];
  tabelas?: MemoriaTabela[];
  imagens?: MemoriaImagem[];
  notas?: string[];
};
```

- [ ] **Step 4: Renderizar o SVG em `secaoHtml`**

Em `render-html.ts`, dentro de `secaoHtml`, após montar `tabelas` e antes de `notas`:

```ts
  const imagens = (s.imagens ?? [])
    .map(
      (im) => `<figure class="fig">
        ${im.titulo ? `<figcaption>${esc(im.titulo)}</figcaption>` : ""}
        ${im.svg}
      </figure>`,
    )
    .join("");
```

Incluir `${imagens}` na string retornada (entre `${tabelas}` e `${notas}`):

```ts
  return `<section><h2>${esc(s.titulo)}</h2>${paragrafos}${valores}${tabelas}${imagens}${notas}</section>`;
```

E acrescentar CSS no bloco `<style>` (junto às demais regras):

```css
  figure.fig { margin: 8px 0; page-break-inside: avoid; text-align: center; }
  figure.fig figcaption { font-size: 9pt; color: #555; margin-bottom: 4px; font-weight: 600; }
  figure.fig svg { max-width: 100%; height: auto; }
```

> **Segurança:** `im.svg` é injetado sem escape (é o ponto do recurso). Só passar SVG gerado por builders internos — nunca strings vindas de input do usuário. Documentar isso no JSDoc do tipo (feito no Step 3).

- [ ] **Step 5: Rodar teste e lint; commit**

Run: `npx vitest run src/modules/ferramentas/memoria/render-html.test.ts && npm run lint`
Expected: PASS + lint limpo.

```bash
git add src/modules/ferramentas/memoria/types.ts src/modules/ferramentas/memoria/render-html.ts src/modules/ferramentas/memoria/render-html.test.ts
git commit -m "feat(ferramentas): suporte a imagem/SVG na memória de cálculo (HTML/PDF)"
```

---

### Task 1.2: Builder de diagrama de tensão-no-solo + embutir na memória da `sapata-excentrica`

Gera o primeiro diagrama de **resultado** do módulo (trapezoidal quando `e ≤ a/6`, triangular quando `descola`) e o injeta na memória da sapata excêntrica via o campo criado na Task 1.1.

**Files:**
- Create: `src/modules/ferramentas/memoria/diagramas/tensao-solo.ts`
- Create: `src/modules/ferramentas/memoria/diagramas/tensao-solo.test.ts`
- Modify: `src/modules/ferramentas/service.ts` (função `memoriaSapataExcentrica`, ~linha 330 em diante — buscar `function memoriaSapataExcentrica`)

**Interfaces:**
- Consumes: `ResultadoIsolada` de `eccentric-footing.ts` (`sigmaMax`, `sigmaMin`, `descola`, `e`, `emax`) e a dimensão `a` (cm).
- Produces: `svgTensaoSolo(args: { a: number; sigmaMax: number; sigmaMin: number; descola: boolean }): string` — retorna markup `<svg>` autocontido, sem dependência externa, texto em pt-BR, cores fixas legíveis em fundo branco (o PDF é sempre claro).

- [ ] **Step 1: Escrever o teste do builder (falha antes)**

```ts
// tensao-solo.test.ts
import { describe, it, expect } from "vitest";
import { svgTensaoSolo } from "./tensao-solo";

describe("svgTensaoSolo", () => {
  it("desenha diagrama trapezoidal com σmax/σmin quando não descola", () => {
    const svg = svgTensaoSolo({ a: 240, sigmaMax: 280, sigmaMin: 60, descola: false });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("280"); // rótulo σmax
    expect(svg).toContain("60");  // rótulo σmin
  });
  it("desenha triangular (σmin=0) quando descola", () => {
    const svg = svgTensaoSolo({ a: 240, sigmaMax: 400, sigmaMin: 0, descola: true });
    expect(svg).toContain("<polygon"); // triângulo de contato
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/memoria/diagramas/tensao-solo.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o builder**

Baseado no `svgTensoes` do arquivo-fonte (linhas 201-211 de `docs/calculadoras`), reescrito com cores de impressão fixas. Escala vertical proporcional a `σmax`; largura proporcional a `a`.

```ts
/** Diagrama de tensões no solo sob a base (trapezoidal ou triangular). Puro, retorna <svg> autocontido. */
export function svgTensaoSolo(args: { a: number; sigmaMax: number; sigmaMin: number; descola: boolean }): string {
  const { a, sigmaMax, sigmaMin, descola } = args;
  const W = 460, H = 220, x0 = 60, y0 = 60, baseW = W - 2 * x0;
  const sc = 90 / Math.max(sigmaMax, 0.001);
  const y1 = y0 + sigmaMin * sc; // borda menos carregada
  const y2 = y0 + sigmaMax * sc; // borda mais carregada
  const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const diagrama = descola
    // triângulo: contato só numa parte da base (x = 3·(a/2 − e)); aqui desenha do lado carregado até σ=0.
    ? `<polygon points="${x0},${y0} ${x0},${y2} ${x0 + baseW * 0.66},${y0}" fill="#dc262633" stroke="#dc2626" stroke-width="2"/>`
    : `<polygon points="${x0},${y0} ${x0},${y1} ${x0 + baseW},${y2} ${x0 + baseW},${y0}" fill="#dc262633" stroke="#dc2626" stroke-width="2"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg" style="background:#fff">
    <text x="${W / 2}" y="20" fill="#b45309" font-size="12" font-weight="bold" text-anchor="middle">Tensões na base do solo (kPa)</text>
    <rect x="${x0}" y="${y0 - 24}" width="${baseW}" height="24" fill="#dbeafe" stroke="#334155" stroke-width="1.5"/>
    ${diagrama}
    <text x="${x0 - 6}" y="${(descola ? y2 : y1) + 12}" fill="#b91c1c" font-size="11" text-anchor="end">σmin = ${f(descola ? 0 : sigmaMin)}</text>
    <text x="${x0 + baseW + 6}" y="${y2 + 12}" fill="#b91c1c" font-size="11">σmax = ${f(sigmaMax)}</text>
    <text x="${W / 2}" y="${H - 8}" fill="#475569" font-size="11" text-anchor="middle">a = ${f(a)} cm</text>
  </svg>`;
}
```

- [ ] **Step 4: Rodar teste do builder e ver passar**

Run: `npx vitest run src/modules/ferramentas/memoria/diagramas/tensao-solo.test.ts`
Expected: PASS.

- [ ] **Step 5: Injetar o diagrama na memória da sapata excêntrica (modo isolada)**

Em `service.ts`, dentro de `memoriaSapataExcentrica`, no ramo `modo === "isolada"`, adicionar uma seção com o diagrama. Import no topo de `service.ts`:

```ts
import { svgTensaoSolo } from "./memoria/diagramas/tensao-solo";
```

Na montagem das seções do modo isolada, acrescentar:

```ts
      {
        titulo: "Diagrama de tensões",
        imagens: [{
          titulo: r.descola ? "Diagrama triangular (com descolamento)" : "Diagrama trapezoidal",
          svg: svgTensaoSolo({ a: e.a, sigmaMax: r.sigmaMax, sigmaMin: r.sigmaMin, descola: r.descola }),
        }],
      },
```

(onde `e` = entradas parseadas e `r` = resultado de `calcular` no ramo isolada; confirmar os nomes das variáveis locais ao abrir a função.)

- [ ] **Step 6: Lint + verificar PDF manualmente; commit**

Run: `npm run lint`
Expected: limpo. Gerar um cálculo de `sapata-excentrica` (modo isolada) na UI, exportar PDF e confirmar que o diagrama aparece.

```bash
git add src/modules/ferramentas/memoria/diagramas/ src/modules/ferramentas/service.ts
git commit -m "feat(ferramentas): diagrama de tensões no solo no memorial da sapata excêntrica"
```

---

### Task 1.3: Cabeçalho técnico opcional (ART/RRT + responsável/CREA) no memorial

O memorial do arquivo-fonte tem cabeçalho de identificação (obra/cliente/responsável/CREA-CAU/ART-RRT) e bloco de assinaturas — hoje ausentes no PDF do SenaHub. Reaproveitar o modelo `ResponsavelTecnico` existente (schema.prisma:2459-2471, já usado em `licitacoes`) e dados de `Projeto`; único dado novo é o número da ART/RRT e a revisão.

**Files:**
- Modify: `src/modules/ferramentas/memoria/types.ts` (tipo `MemoriaDoc` — bloco `identificacao?`)
- Modify: `src/modules/ferramentas/memoria/render-html.ts` (render do cabeçalho técnico + assinaturas)
- Modify: `src/modules/ferramentas/service.ts` (`montarMemoria`/`MemoriaOpts` — repassar identificação quando fornecida)
- Test: `src/modules/ferramentas/memoria/render-html.test.ts`

**Interfaces:**
- Produces:
```ts
type MemoriaIdentificacao = {
  obra?: string; cliente?: string; local?: string;
  responsavel?: string; registro?: string; // ex.: "CREA-SP 123456"
  art?: string; revisao?: string;
  assinaturas?: boolean; // se true, render dos 3 campos de assinatura
};
```
campo `MemoriaDoc.identificacao?: MemoriaIdentificacao`.

- [ ] **Step 1: Teste do cabeçalho técnico (falha antes)**

```ts
it("renderiza cabeçalho técnico e assinaturas quando identificacao é fornecida", () => {
  const html = renderMemoriaHtml({
    ferramenta: "x", titulo: "T", geradoEm: new Date().toISOString(), disclaimer: "d", secoes: [],
    identificacao: { obra: "Edifício Alfa", responsavel: "Eng. Fulano", registro: "CREA-SP 123456", art: "ART-000111", assinaturas: true },
  });
  expect(html).toContain("Edifício Alfa");
  expect(html).toContain("CREA-SP 123456");
  expect(html).toContain("ART-000111");
  expect(html).toContain("Responsável técnico");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/memoria/render-html.test.ts -t "cabeçalho técnico"`
Expected: FAIL.

- [ ] **Step 3: Adicionar o tipo em `types.ts`**

```ts
export type MemoriaIdentificacao = {
  obra?: string;
  cliente?: string;
  local?: string;
  responsavel?: string;
  registro?: string;
  art?: string;
  revisao?: string;
  assinaturas?: boolean;
};
```
E em `MemoriaDoc`, acrescentar `identificacao?: MemoriaIdentificacao;`.

- [ ] **Step 4: Renderizar no `render-html.ts`**

Adicionar, dentro de `renderMemoriaHtml`, antes do `${doc.secoes...}`, um bloco condicional:

```ts
  const id = doc.identificacao;
  const cab = id
    ? `<table class="ident">
        ${id.obra ? `<tr><td class="k">Obra</td><td>${esc(id.obra)}</td></tr>` : ""}
        ${id.cliente ? `<tr><td class="k">Cliente</td><td>${esc(id.cliente)}</td></tr>` : ""}
        ${id.local ? `<tr><td class="k">Local</td><td>${esc(id.local)}</td></tr>` : ""}
        ${id.responsavel ? `<tr><td class="k">Responsável técnico</td><td>${esc(id.responsavel)}${id.registro ? " — " + esc(id.registro) : ""}</td></tr>` : ""}
        ${id.art ? `<tr><td class="k">ART / RRT</td><td>${esc(id.art)}</td></tr>` : ""}
        ${id.revisao ? `<tr><td class="k">Revisão</td><td>${esc(id.revisao)}</td></tr>` : ""}
      </table>`
    : "";
  const assinaturas = id?.assinaturas
    ? `<div class="sig">
        <div><div class="ln"></div>${esc(id.responsavel ?? "Responsável técnico")}<br>${esc(id.registro ?? "CREA/CAU")}</div>
        <div><div class="ln"></div>Verificado por</div>
        <div><div class="ln"></div>Aprovado por</div>
      </div>`
    : "";
```

Inserir `${cab}` logo após `</header>` e `${assinaturas}` logo antes do `<footer>`. Acrescentar CSS:

```css
  table.ident { width: 100%; border: 1px solid #334155; border-radius: 4px; margin: 0 0 14px; font-size: 9.5pt; }
  table.ident td { padding: 2px 8px; }
  table.ident td.k { color: #475569; width: 34%; font-weight: 600; }
  .sig { display: flex; gap: 24px; justify-content: space-around; margin-top: 40px; page-break-inside: avoid; }
  .sig div { flex: 1; text-align: center; font-size: 9.5pt; }
  .sig .ln { border-top: 1px solid #111; margin-bottom: 4px; }
```

- [ ] **Step 5: Repassar `identificacao` em `MemoriaOpts`/`montarMemoria`**

Em `service.ts`, localizar o tipo `MemoriaOpts` (usado por `montarMemoria`) e adicionar `identificacao?: MemoriaIdentificacao;`. Propagar no objeto `base` e garantir que `montarMemoriaBase` o repasse (adicionar `identificacao` ao `MontarBaseArgs` em `memoria/index.ts` e ao retorno de `montarMemoriaBase`). O preenchimento a partir de `Projeto`/`ResponsavelTecnico` é responsabilidade da action que chama `montarMemoria` (fora do escopo puro — fica para a camada de UI, opcional).

- [ ] **Step 6: Rodar testes + lint; commit**

Run: `npx vitest run src/modules/ferramentas/memoria/render-html.test.ts && npm run lint`
Expected: PASS + limpo.

```bash
git add src/modules/ferramentas/memoria/ src/modules/ferramentas/service.ts
git commit -m "feat(ferramentas): cabeçalho técnico (ART/CREA) e assinaturas opcionais no memorial"
```

---

## FASE 2 — Perfil de solo compartilhado + `sapata-spt`

### Task 2.1: Extrair `camadaSptSchema` compartilhado

Prepara a costura de perfil de solo para reuso entre `pile-spt` (existente), `sapata-spt` (Task 2.2) e `recalque-fundacao` (Fase 3), sem promover a modelo Prisma ainda (gatilho de promoção: reuso real do mesmo furo entre calculadoras).

**Files:**
- Create: `src/modules/ferramentas/calc/spt-shared.ts`
- Create: `src/modules/ferramentas/calc/spt-shared.test.ts`
- Modify: `src/modules/ferramentas/calc/pile-spt.ts:13-47` (passar a importar `SOLOS`/`camadaSptSchema` do módulo compartilhado)

**Interfaces:**
- Produces: `export const SOLOS` (mover de `pile-spt.ts`), `export type TipoSolo`, `export const camadaSptSchema` (`{ solo, nspt, espessuraM }`), e helper `export function nMedioPonderado(camadas): number`.

- [ ] **Step 1: Teste do módulo compartilhado (falha antes)**

```ts
// spt-shared.test.ts
import { describe, it, expect } from "vitest";
import { camadaSptSchema, nMedioPonderado, SOLOS } from "./spt-shared";

describe("spt-shared", () => {
  it("valida uma camada de SPT", () => {
    expect(() => camadaSptSchema.parse({ solo: "argila_arenosa", nspt: 10, espessuraM: 2 })).not.toThrow();
  });
  it("N médio ponderado pela espessura", () => {
    const n = nMedioPonderado([{ solo: "areia", nspt: 10, espessuraM: 1 }, { solo: "areia", nspt: 20, espessuraM: 3 }]);
    expect(n).toBeCloseTo((10 * 1 + 20 * 3) / 4, 6);
  });
  it("expõe a tabela de solos", () => { expect(SOLOS.argila.K).toBeGreaterThan(0); });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/spt-shared.test.ts`
Expected: FAIL.

- [ ] **Step 3: Criar `spt-shared.ts` (mover `SOLOS` de pile-spt) e o helper**

```ts
import { z } from "zod";

export const SOLOS = {
  areia: { label: "Areia", K: 1000, alpha: 1.4, C: 400 },
  areia_siltosa: { label: "Areia siltosa", K: 800, alpha: 2.0, C: 400 },
  areia_argilosa: { label: "Areia argilosa", K: 600, alpha: 3.0, C: 400 },
  silte: { label: "Silte", K: 400, alpha: 3.0, C: 200 },
  silte_arenoso: { label: "Silte arenoso", K: 550, alpha: 2.2, C: 250 },
  silte_argiloso: { label: "Silte argiloso", K: 230, alpha: 3.4, C: 200 },
  argila: { label: "Argila", K: 200, alpha: 6.0, C: 120 },
  argila_arenosa: { label: "Argila arenosa", K: 350, alpha: 2.4, C: 120 },
  argila_siltosa: { label: "Argila siltosa", K: 220, alpha: 4.0, C: 120 },
} as const;
export type TipoSolo = keyof typeof SOLOS;

export const camadaSptSchema = z.object({
  solo: z.enum(Object.keys(SOLOS) as [TipoSolo, ...TipoSolo[]]),
  nspt: z.number().min(0),
  espessuraM: z.number().positive(),
});
export type CamadaSpt = z.infer<typeof camadaSptSchema>;

export function nMedioPonderado(camadas: CamadaSpt[]): number {
  const h = camadas.reduce((s, c) => s + c.espessuraM, 0);
  return h > 0 ? camadas.reduce((s, c) => s + c.nspt * c.espessuraM, 0) / h : 0;
}
```

- [ ] **Step 4: Refatorar `pile-spt.ts` para reusar (sem mudar comportamento)**

Substituir a definição local de `SOLOS` e do sub-schema de camada por imports de `spt-shared.ts`:

```ts
import { SOLOS, camadaSptSchema, type TipoSolo } from "./spt-shared";
// ...
export const entradaSchema = z.object({
  estaca: z.enum(["pre_moldada", "metalica", "franki", "escavada"]),
  diametroCm: z.number().positive(),
  camadas: z.array(camadaSptSchema).min(1),
});
```

Manter `ESTACAS` local (é específico de estaca). Rodar a suíte de `pile-spt` para garantir zero regressão.

- [ ] **Step 5: Rodar tudo e commit**

Run: `npx vitest run src/modules/ferramentas/calc/spt-shared.test.ts src/modules/ferramentas/calc/pile-spt.test.ts && npm run lint`
Expected: PASS + limpo.

```bash
git add src/modules/ferramentas/calc/spt-shared.ts src/modules/ferramentas/calc/spt-shared.test.ts src/modules/ferramentas/calc/pile-spt.ts
git commit -m "refactor(ferramentas): extrai perfil de SPT compartilhado (spt-shared)"
```

---

### Task 2.2: Engine `sapata-spt` — σadm por Alonso + verificação do bulbo (Situação II)

Dimensiona sapata quadrada a partir de σadm estimado por SPT (Alonso, `σadm = N/5` em kgf/cm² → converter p/ kPa), com verificação do bulbo de tensões (2B) recalculada do perfil `camadas[]` — corrigindo o hardcode do arquivo. Alonso só vale N≤20: **emitir alerta e capar**.

**Files:**
- Create: `src/modules/ferramentas/calc/sapata-spt.ts`
- Create: `src/modules/ferramentas/calc/sapata-spt.test.ts`
- Modify: `src/modules/ferramentas/registry.ts` (nova entrada, disciplina Fundações)
- Modify: `src/modules/ferramentas/service.ts` (`calcular` + `montarMemoria` + builder `memoriaSapataSpt`)
- Modify: `src/modules/ferramentas/savefile.ts` (import + entrada no `ENTRADAS_SCHEMAS`)

**Interfaces:**
- Consumes: `camadaSptSchema`, `nMedioPonderado` de `spt-shared.ts`.
- Produces:
```ts
export const entradaSchema = z.object({
  fz: z.number().positive(),        // kN — carga vertical
  fm: z.number().min(1).default(1.05), // fator de majoração
  profundidadeM: z.number().positive(), // m — cota de apoio
  camadas: z.array(camadaSptSchema).min(1), // perfil abaixo da cota de apoio
});
export type ResultadoSapataSpt = {
  sigmaAdmKpa: number; nApoio: number; capadoN20: boolean;
  ladoCm: number;      // B (quadrada, arredondado p/ 10 cm)
  bulboM: number;      // 2B
  nBulbo: number; sigmaAdmBulboKpa: number; bulboOk: boolean;
  alertas: string[]; situacao: "ok" | "revisar";
};
export function calcular(input): ResultadoSapataSpt
```

- [ ] **Step 1: Escrever o teste com a fixture da Situação II**

Situação II: Fz=50 tf (=490,33 kN), N(apoio)=10, FM=1,05. σadm = 10/5 = 2 kgf/cm² = 196,13 kPa. B = √(FM·Fz/σadm). Perfil de exemplo (2m→4;3m→10;4m→15;5m→17;6m→23;7m→29) vira `camadas[]` reais.

```ts
import { describe, it, expect } from "vitest";
import { calcular } from "./sapata-spt";

describe("sapata-spt (Alonso + bulbo) — Situação II", () => {
  const camadas = [
    { solo: "argila_arenosa", nspt: 10, espessuraM: 1 },
    { solo: "argila_arenosa", nspt: 15, espessuraM: 1 },
    { solo: "argila_arenosa", nspt: 17, espessuraM: 1 },
    { solo: "argila_arenosa", nspt: 23, espessuraM: 1 },
  ] as const;

  it("σadm = N/5 e capa quando N>20 com alerta", () => {
    const r = calcular({ fz: 490.33, fm: 1.05, profundidadeM: 2, camadas: [...camadas] });
    expect(r.sigmaAdmKpa).toBeCloseTo((10 / 5) * 98.0665, 1); // 2 kgf/cm² → kPa
    expect(r.ladoCm % 10).toBe(0); // arredondado a 10 cm
    const rN30 = calcular({ fz: 490.33, fm: 1.05, profundidadeM: 2, camadas: [{ solo: "areia", nspt: 30, espessuraM: 2 }] });
    expect(rN30.capadoN20).toBe(true);
    expect(rN30.alertas.some((a) => a.includes("N ≤ 20"))).toBe(true);
  });

  it("recalcula o N do bulbo a partir das camadas (não hardcoded)", () => {
    const r = calcular({ fz: 490.33, fm: 1.05, profundidadeM: 2, camadas: [...camadas] });
    expect(r.bulboM).toBeGreaterThan(0);
    expect(r.nBulbo).toBeGreaterThan(0);
    expect(typeof r.bulboOk).toBe("boolean");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ferramentas/calc/sapata-spt.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar o engine**

Método (reescrito das linhas 248-263 de `docs/calculadoras`, corrigindo hardcode e cap): σadm=N/5 (kgf/cm²); cap N a 20 com alerta; converter a kPa; B=√(FM·Fz/σadm) com Fz em kN→ atenção às unidades (trabalhar tudo em kN e kPa: área m² = FM·Fz/σadm_kPa; lado = √área; arredondar para múltiplo de 0,10 m → cm). Bulbo=2B (m); somar camadas até a profundidade do bulbo abaixo da cota de apoio; `nBulbo = nMedioPonderado(camadas dentro do bulbo)`; σadm(bulbo)=min(nBulbo/5, 2,5 kgf/cm²)→kPa; `bulboOk = σadm_bulbo ≥ σadm_apoio`.

```ts
import { z } from "zod";
import { camadaSptSchema, nMedioPonderado, type CamadaSpt } from "./spt-shared";

const KGFCM2_KPA = 98.0665;

export const entradaSchema = z.object({
  fz: z.number().positive(),
  fm: z.number().min(1).default(1.05),
  profundidadeM: z.number().positive(),
  camadas: z.array(camadaSptSchema).min(1),
});
export type EntradaSapataSpt = z.infer<typeof entradaSchema>;
export type EntradaSapataSptInput = z.input<typeof entradaSchema>;

export type ResultadoSapataSpt = {
  sigmaAdmKpa: number; nApoio: number; capadoN20: boolean;
  ladoCm: number; bulboM: number; nBulbo: number;
  sigmaAdmBulboKpa: number; bulboOk: boolean;
  alertas: string[]; situacao: "ok" | "revisar";
};

function camadasAteProfundidade(camadas: CamadaSpt[], limiteM: number): CamadaSpt[] {
  const out: CamadaSpt[] = []; let acc = 0;
  for (const c of camadas) {
    if (acc >= limiteM) break;
    const usa = Math.min(c.espessuraM, limiteM - acc);
    out.push({ ...c, espessuraM: usa }); acc += usa;
  }
  return out;
}

export function calcular(input: EntradaSapataSptInput): ResultadoSapataSpt {
  const v = entradaSchema.parse(input);
  const alertas: string[] = [];
  const nApoio = v.camadas[0].nspt;
  const capadoN20 = nApoio > 20;
  if (capadoN20) alertas.push("Correlação de Alonso válida para N ≤ 20; N do apoio capado a 20.");
  const nUsado = Math.min(nApoio, 20);
  const sigmaAdmKpa = (nUsado / 5) * KGFCM2_KPA;

  const areaM2 = (v.fm * v.fz) / sigmaAdmKpa; // kN / kPa = m²
  const ladoM = Math.ceil(Math.sqrt(areaM2) / 0.1) * 0.1;
  const ladoCm = ladoM * 100;

  const bulboM = 2 * ladoM;
  const dentro = camadasAteProfundidade(v.camadas, bulboM);
  const nBulbo = Math.min(nMedioPonderado(dentro), 20);
  const sigmaAdmBulboKpa = Math.min((nBulbo / 5) * KGFCM2_KPA, 2.5 * KGFCM2_KPA);
  const bulboOk = sigmaAdmBulboKpa >= sigmaAdmKpa * 0.999;
  if (!bulboOk) alertas.push("σadm no bulbo de tensões < σadm na cota de apoio: recalcular a base com a tensão do bulbo.");

  return {
    sigmaAdmKpa, nApoio, capadoN20, ladoCm, bulboM, nBulbo,
    sigmaAdmBulboKpa, bulboOk,
    alertas, situacao: bulboOk ? "ok" : "revisar",
  };
}
```

- [ ] **Step 4: Rodar teste do engine e ver passar**

Run: `npx vitest run src/modules/ferramentas/calc/sapata-spt.test.ts`
Expected: PASS.

- [ ] **Step 5: Integrar nos 4 pontos**

(a) `registry.ts` — nova entrada (após `estaca-spt`), reusar um ícone existente (ex. `Square`):

```ts
  {
    key: "sapata-spt",
    nome: "Sapata por SPT (Alonso)",
    descricao: "Pré-dimensiona sapata quadrada por σadm estimado do SPT (Alonso, N ≤ 20) e verifica o bulbo de tensões (2B) a partir do perfil de sondagem. Estimativa — não substitui laudo geotécnico.",
    disciplina: "Fundações",
    tipo: "rapida",
    norma: "NBR 6484 / NBR 6122",
    exportaveis: ["pdf", "xlsx"],
    icon: Square,
  },
```

(b) `service.ts` — `calcular`: adicionar `case "sapata-spt"` retornando `campos` (σadm, lado B, bulbo Ok); `montarMemoria`: `case "sapata-spt": return memoriaSapataSpt(entradas, base);` + escrever `memoriaSapataSpt` (seções: correlação, dimensionamento, verificação do bulbo). Imports de `calcular as calcularSapataSpt` e `entradaSchema as sapataSptSchema`.

(c) `savefile.ts` — `import { entradaSchema as sapataSptSchema } from "./calc/sapata-spt";` e `"sapata-spt": sapataSptSchema,` no `ENTRADAS_SCHEMAS`.

(d) Opcional: `guia-meta.ts` — entrada didática para `sapata-spt`.

- [ ] **Step 6: Rodar suíte + lint; commit**

Run: `npm test && npm run lint`
Expected: tudo verde.

```bash
git add src/modules/ferramentas/calc/sapata-spt.ts src/modules/ferramentas/calc/sapata-spt.test.ts src/modules/ferramentas/registry.ts src/modules/ferramentas/service.ts src/modules/ferramentas/savefile.ts
git commit -m "feat(ferramentas): sapata por SPT (Alonso) com verificação de bulbo"
```

---

## FASES 3–6 — planos próprios (código completo expandido)

As Fases 3 a 6 foram desmembradas em planos independentes, cada um com **todo o código expandido** (engine + testes + integração, sem placeholders). Executar cada um como plano autônomo:

| Fase | Situações | Plano próprio |
|---|---|---|
| **3 — `recalque-fundacao`** | VIII, IX, X, XI (recalque imediato elástico/fatias, adensamento, secundária) | [2026-07-27-recalque-fundacao.md](2026-07-27-recalque-fundacao.md) |
| **4 — `sapata-prova-carga`** | I (ensaio de placa / Boston) | [2026-07-27-sapata-prova-carga.md](2026-07-27-sapata-prova-carga.md) |
| **5 — Enriquecimentos** | V (deslizamento + c/φ por SPT), VI (preset de divisa) sobre `eccentric-footing.ts` | [2026-07-27-enriquecimentos-sapata-excentrica.md](2026-07-27-enriquecimentos-sapata-excentrica.md) |
| **6 — `sapata-associada`** | IV (2 pilares + viga de rigidez + DEC/DMF) | [2026-07-27-sapata-associada.md](2026-07-27-sapata-associada.md) |

**Dependências entre planos:**
- A Fase 3 (modo `fatias`) e a Fase 6 dependem do campo `MemoriaSecao.imagens` — **Task 1.1 deste plano-mestre** (Fase 1).
- A Fase 3 (modo `fatias`) depende de `calc/spt-shared.ts` — **Task 2.1 deste plano-mestre** (Fase 2).
- A Fase 5 estende `eccentric-footing.ts` (já existente) — sem dependência das demais.
- A Fase 4 é totalmente independente.

**Ordem de entrega recomendada:** Fase 0 → 1 → 2 → 3 → (4 / 5 / 6 conforme demanda). As chaves de `registry.ts` reservadas nos planos derivados são `sapata-prova-carga` (E25), `sapata-spt` (E26), `sapata-associada` (E27), `recalque-fundacao` (E28).

## Itens fora do escopo deste plano (registrar como backlog separado)

- **Radier / fundação em placa:** 12ª lacuna real (nem o arquivo nem o SenaHub cobrem). Exige modelagem 2D (placa sobre base elástica / Winkler) — iniciativa de Produto/Arquitetura própria, sem código a portar do arquivo.
- **Modelo Prisma `SondagemSPT`/`PerfilSolo`:** promover `camadaSptSchema` a modelo persistido só quando 2+ calculadoras do mesmo projeto precisarem reusar o mesmo furo (gatilho por uso real). Até lá, `camadas[]` local basta.
- **Rasterização de SVG→PNG para docx/xlsx:** só quando uma ferramenta exigir gráfico no Word/Excel (reusar `CHROME_PATH`/puppeteer de `auto-store.ts`).
- **Licenciamento:** o arquivo `docs/calculadoras` é material de terceiros (IPOG). Este plano reimplementa a partir das normas ABNT e usa os exemplos apenas como fixtures — confirmar com o responsável se o arquivo pode permanecer versionado no repo.

---

## Self-Review (checagem do autor do plano contra o estudo)

- **Cobertura das 11 situações:** I→Fase 4 (plano próprio); II→Task 2.2; III→Task 0.0 (validação); IV→Fase 6 (plano próprio); V→Fase 5 (plano próprio); VI→Fase 5 (plano próprio); VII→Task 0.0 (validação); VIII/IX/X/XI→Fase 3 (plano próprio). ✔ Todas endereçadas.
- **Achados incidentais:** contraste dark-mode→Task 0.1; segurança pctAlivio→Task 0.2; sem-diagrama-no-PDF→Tasks 1.1/1.2; sem-cabeçalho-técnico→Task 1.3; licenciamento→backlog. ✔
- **Consistência de tipos:** `camadaSptSchema`/`SOLOS`/`nMedioPonderado` definidos na Task 2.1 e consumidos em 2.2 e na Fase 3; `MemoriaImagem`/`imagens` definidos em 1.1 e consumidos em 1.2 e nas Fases 3/6; `MemoriaIdentificacao` em 1.3. ✔
- **Placeholders:** Fases 0-2 têm código completo neste documento; Fases 3-6 têm código completo em seus planos próprios (ver tabela na seção "FASES 3–6"), sem placeholders. ✔
