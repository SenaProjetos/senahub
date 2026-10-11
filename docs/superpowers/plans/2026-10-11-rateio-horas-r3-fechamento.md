# Rateio de horas — R3: fechamento travado, reabertura, recálculo e meses abertos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (sessões 2 a 4 do roteiro). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mês fechado fica travado; reabrir exige motivo e deixa histórico; um mês antigo pode ser recalculado no cálculo novo; o sistema mostra quando um mês fechado mudou depois do fechamento; a margem do projeto soma todos os meses ainda abertos e o alerta lista todos eles.

**Architecture:** Regras puras em `src/modules/rh/rateio/fechamento/regras.ts` (pode fechar/reabrir/recalcular, divergência, meses abertos, itens do menu). Ações com I/O em `src/modules/rh/rateio/actions.ts`. Reabrir **apaga** cabeçalho e linhas do mês e grava um `FechamentoRateioEvento` (os leitores continuam lendo "fechado = existe cabeçalho"). Tela nova `/rh/rateio` com menu de contexto (ADR-0002). Permissão nova `ponto:custo` + `podeVerCusto()` (decisão 26: admin e sócios).

**Tech Stack:** Next.js 15, Prisma 7, Zod, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md](../specs/2026-09-15-rateio-horas-decisoes.md) — decisões 8, 14, 17, 18, 19 (parte "ver custo"), 26. Roteiro: [plano da R1](2026-10-11-rateio-horas-r1-custo-da-hora.md).

**Schema:** já aplicado (migração `20261011150000_rateio_r2_r5`): `FechamentoRateio.custoTotal`, model `FechamentoRateioEvento` (eventos de origem já gravados para os fechamentos existentes).

## Global Constraints

- Mesmas da R1. Quem fecha, reabre e recalcula: `rh:gerir` (`gereRh: true`). Quem vê a tela: `ponto:rateio`. Quem vê valores em reais: `podeVerCusto(user)`.
- Mês em curso nunca fecha (já vale desde a R1: `mesTerminou`).
- Reabrir e recalcular pedem **motivo com pelo menos 10 caracteres**.
- Recalcular só existe para mês **fechado no cálculo antigo** (`calculo = "legado"`); usa o cálculo novo mesmo antes do corte, com a primeira tabela de encargos (`tabelaPosterior`), e grava o evento "recalculou".
- `confirm()` sempre ANTES de `startTransition` (guarda do repositório).

## Review Focus

1. **Reabrir um mês e não fechar de novo:** a margem do projeto passa a mostrar a estimativa daquele mês (não some, não conta duas vezes).
2. **Dois "Fechar" no mesmo mês ao mesmo tempo:** um fecha, o outro recebe "Este mês já está fechado…", sem linha duplicada (índice `rateio_hora_linha_key`).
3. **Ajuste de ponto num mês fechado:** a tela mostra "alterado depois do fechamento" com a diferença em reais (só para quem vê custo) e em horas (para todos).
4. **Mês antigo do cálculo legado recalculado:** o evento guarda o total antigo e o novo; a margem passa a usar o novo.
5. **Pessoa sem `ponto:custo` (coordenação):** vê horas e meses, nunca reais — nem no tooltip, nem no menu, nem no CSV.

---

### Task R3.1: Regras puras do fechamento (sessão 2, Sonnet high)

**Files:**
- Create: `src/modules/rh/rateio/fechamento/regras.ts`
- Test: `src/modules/rh/rateio/fechamento/regras.test.ts`

**Interfaces — Produces:**
- `MSG_JA_FECHADO`, `MSG_NAO_FECHADO`, `MSG_MOTIVO_CURTO`, `MSG_SO_LEGADO`, `MSG_MES_EM_CURSO`
- `motivoParaNaoFechar(p: { mesTerminou: boolean; fechado: boolean }): string | null`
- `motivoParaNaoReabrir(p: { fechado: boolean; motivo: string }): string | null`
- `motivoParaNaoRecalcular(p: { fechado: boolean; calculo: string | null; motivo: string }): string | null`
- `divergencia(congeladoCent: number, aoVivoCent: number): { diferencaCent: number; alterado: boolean }`
- `mesesAbertos(p: { corte: string; ate: string; fechados: string[] }): string[]` (datas `AAAA-MM`, `ate` inclusive)
- `itensDoMesRateio(p: { fechado: boolean; calculo: string | null; mesTerminou: boolean; podeGerir: boolean }): AcaoItem[]` (ids `fechar`, `reabrir`, `recalcular`, `detalhes`)

- [ ] **Step 1: Testes que falham**

```ts
// src/modules/rh/rateio/fechamento/regras.test.ts
import { describe, expect, it } from "vitest";
import {
  divergencia, itensDoMesRateio, mesesAbertos, motivoParaNaoFechar, motivoParaNaoReabrir, motivoParaNaoRecalcular,
  MSG_JA_FECHADO, MSG_MES_EM_CURSO, MSG_MOTIVO_CURTO, MSG_NAO_FECHADO, MSG_SO_LEGADO,
} from "./regras";

describe("fechar", () => {
  it("mês em curso e mês já fechado são recusados", () => {
    expect(motivoParaNaoFechar({ mesTerminou: false, fechado: false })).toBe(MSG_MES_EM_CURSO);
    expect(motivoParaNaoFechar({ mesTerminou: true, fechado: true })).toBe(MSG_JA_FECHADO);
    expect(motivoParaNaoFechar({ mesTerminou: true, fechado: false })).toBeNull();
  });
});

describe("reabrir", () => {
  it("só mês fechado, com motivo de 10+ caracteres (sem contar espaços nas pontas)", () => {
    expect(motivoParaNaoReabrir({ fechado: false, motivo: "ajuste de ponto da Ana" })).toBe(MSG_NAO_FECHADO);
    expect(motivoParaNaoReabrir({ fechado: true, motivo: "   curto   " })).toBe(MSG_MOTIVO_CURTO);
    expect(motivoParaNaoReabrir({ fechado: true, motivo: "ajuste de ponto da Ana" })).toBeNull();
  });
});

describe("recalcular", () => {
  it("só mês fechado no cálculo antigo", () => {
    expect(motivoParaNaoRecalcular({ fechado: true, calculo: "v2", motivo: "trazer encargos para setembro" })).toBe(MSG_SO_LEGADO);
    expect(motivoParaNaoRecalcular({ fechado: false, calculo: null, motivo: "trazer encargos para setembro" })).toBe(MSG_NAO_FECHADO);
    expect(motivoParaNaoRecalcular({ fechado: true, calculo: "legado", motivo: "x" })).toBe(MSG_MOTIVO_CURTO);
    expect(motivoParaNaoRecalcular({ fechado: true, calculo: "legado", motivo: "trazer encargos para setembro" })).toBeNull();
  });
});

describe("divergencia", () => {
  it("um centavo de diferença já conta como alterado", () => {
    expect(divergencia(100000, 100000)).toEqual({ diferencaCent: 0, alterado: false });
    expect(divergencia(100000, 100001)).toEqual({ diferencaCent: 1, alterado: true });
    expect(divergencia(100000, 90000)).toEqual({ diferencaCent: -10000, alterado: true });
  });
});

describe("mesesAbertos", () => {
  it("do corte até o mês pedido, sem os fechados, atravessando o ano", () => {
    expect(mesesAbertos({ corte: "2026-10", ate: "2027-02", fechados: ["2026-11", "2027-01"] })).toEqual(["2026-10", "2026-12", "2027-02"]);
  });
  it("corte depois do limite: nada", () => {
    expect(mesesAbertos({ corte: "2026-10", ate: "2026-09", fechados: [] })).toEqual([]);
  });
});

describe("itensDoMesRateio (ADR-0002)", () => {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  it("sem rh:gerir só há 'Ver detalhes'", () => {
    expect(ids(itensDoMesRateio({ fechado: true, calculo: "legado", mesTerminou: true, podeGerir: false }))).toEqual(["detalhes"]);
  });
  it("mês aberto e terminado: fechar habilitado", () => {
    const itens = itensDoMesRateio({ fechado: false, calculo: null, mesTerminou: true, podeGerir: true });
    expect(ids(itens)).toEqual(["detalhes", "fechar"]);
    expect(itens.find((i) => i.id === "fechar")).not.toHaveProperty("desabilitado");
  });
  it("mês em curso: fechar desabilitado com o motivo", () => {
    const fechar = itensDoMesRateio({ fechado: false, calculo: null, mesTerminou: false, podeGerir: true }).find((i) => i.id === "fechar");
    expect(fechar).toMatchObject({ desabilitado: MSG_MES_EM_CURSO });
  });
  it("mês fechado no v2: reabrir habilitado, recalcular desabilitado com o motivo", () => {
    const itens = itensDoMesRateio({ fechado: true, calculo: "v2", mesTerminou: true, podeGerir: true });
    expect(ids(itens)).toEqual(["detalhes", "reabrir", "recalcular"]);
    expect(itens.find((i) => i.id === "recalcular")).toMatchObject({ desabilitado: MSG_SO_LEGADO });
  });
});
```

- [ ] **Step 2: Ver falhar** — `npx vitest run src/modules/rh/rateio/fechamento`.

- [ ] **Step 3: Implementação**

```ts
// src/modules/rh/rateio/fechamento/regras.ts
/**
 * Regras do fechamento do rateio (R3; decisões 8, 14, 17 e 18 do spec 2026-09-15). PURO: a mesma frase
 * é o erro da ação e o motivo do item desabilitado no menu (ADR-0002).
 */
import type { AcaoItem } from "@/components/ui/acoes";

export const MSG_MES_EM_CURSO = "Este mês ainda não terminou. O rateio só fecha depois do último dia do mês.";
export const MSG_JA_FECHADO = "Este mês já está fechado. Para mudar, reabra com um motivo.";
export const MSG_NAO_FECHADO = "Este mês não está fechado.";
export const MSG_MOTIVO_CURTO = "Explique o motivo (pelo menos 10 caracteres).";
export const MSG_SO_LEGADO = "Só um mês fechado no cálculo antigo pode ser recalculado.";

const motivoOk = (m: string) => m.trim().length >= 10;

export function motivoParaNaoFechar(p: { mesTerminou: boolean; fechado: boolean }): string | null {
  if (!p.mesTerminou) return MSG_MES_EM_CURSO;
  if (p.fechado) return MSG_JA_FECHADO;
  return null;
}

export function motivoParaNaoReabrir(p: { fechado: boolean; motivo: string }): string | null {
  if (!p.fechado) return MSG_NAO_FECHADO;
  if (!motivoOk(p.motivo)) return MSG_MOTIVO_CURTO;
  return null;
}

export function motivoParaNaoRecalcular(p: { fechado: boolean; calculo: string | null; motivo: string }): string | null {
  if (!p.fechado) return MSG_NAO_FECHADO;
  if (p.calculo !== "legado") return MSG_SO_LEGADO;
  if (!motivoOk(p.motivo)) return MSG_MOTIVO_CURTO;
  return null;
}

export function divergencia(congeladoCent: number, aoVivoCent: number): { diferencaCent: number; alterado: boolean } {
  const diferencaCent = aoVivoCent - congeladoCent;
  return { diferencaCent, alterado: diferencaCent !== 0 };
}

const proximo = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
};

export function mesesAbertos(p: { corte: string; ate: string; fechados: string[] }): string[] {
  const fechados = new Set(p.fechados);
  const out: string[] = [];
  for (let m = p.corte; m <= p.ate; m = proximo(m)) if (!fechados.has(m)) out.push(m);
  return out;
}

export function itensDoMesRateio(p: { fechado: boolean; calculo: string | null; mesTerminou: boolean; podeGerir: boolean }): AcaoItem[] {
  const itens: AcaoItem[] = [{ tipo: "acao", id: "detalhes", rotulo: "Ver detalhes" }];
  if (!p.podeGerir) return itens;
  if (!p.fechado) {
    const motivo = motivoParaNaoFechar({ mesTerminou: p.mesTerminou, fechado: false });
    itens.push({ tipo: "acao", id: "fechar", rotulo: "Fechar mês", ...(motivo ? { desabilitado: motivo } : {}) });
    return itens;
  }
  itens.push({ tipo: "acao", id: "reabrir", rotulo: "Reabrir com motivo…" });
  const recalcular = p.calculo === "legado" ? null : MSG_SO_LEGADO;
  itens.push({ tipo: "acao", id: "recalcular", rotulo: "Recalcular no cálculo novo…", ...(recalcular ? { desabilitado: recalcular } : {}) });
  return itens;
}
```

Atenção: `acoes.ts` é tipo puro de `components/ui`; importar só o `type` mantém o arquivo puro (siga o exemplo de outros `itensDe…` em `src/modules/**/acoes*.ts`; se a guarda do repositório reclamar, mova o arquivo para `src/modules/rh/rateio/fechamento/acoes.ts` no mesmo padrão).

- [ ] **Step 4: Ver passar** e **Step 5: Commit** — `feat(rateio): regras do fechamento travado, reabertura e recálculo (puro)`.

---

### Task R3.2: Permissão "ver custo" (sessão 3, Opus high)

**Files:**
- Modify: `src/lib/permissions-catalog.ts` (recurso `ponto`: `{ acao: "custo", label: "Ver o custo em reais do rateio de horas (por pessoa e por projeto)", leitura: true }` — sem `abre`, porque não abre tela)
- Create: `src/lib/custo-visivel.ts` → `podeVerCusto(u: { superUsuario: boolean; ehSocio: boolean } & Subject): Promise<boolean>` = `u.superUsuario || u.ehSocio || can(u, "ponto", "custo")`
- Test: `src/lib/custo-visivel.test.ts` (super e sócio sim; outros só com o par)

Nenhum perfil recebe o par (decisão 26); não precisa de migração. Sócio entra pela regra explícita, não pelo piso de leitura.

- [ ] Steps: teste que falha → implementação → passa → commit `feat(permissoes): ver custo do rateio só para admin e sócios`.

---

### Task R3.3: Ações — fechar travado, reabrir e recalcular (sessão 3, Opus high)

**Files:**
- Modify: `src/modules/rh/rateio/actions.ts`, `src/modules/rh/rateio/queries.ts` (`calcularRateioDoMes(ano, mes, opcoes?: { forcarV2?: boolean })`)
- Test: `scripts/smoke-rateio-fechamento.ts` + `package.json` (`smoke:rateio-fechamento`)

- [ ] **Step 1:** `fecharRateioMes`: `motivoParaNaoFechar({ mesTerminou, fechado: !!cabecalho })` → `ActionError`; grava `custoTotal` (soma das linhas) no cabeçalho e um evento `fechou`; troca o `upsert` por `create` (o índice único de `(ano, mes)` recusa o segundo — capturar `P2002` → `ActionError(MSG_JA_FECHADO)`).
- [ ] **Step 2:** `reabrirRateioMes({ ano, mes, motivo })` (gereRh, `capturarAntes` = `fechamentoAtual`, `entidadeId` = `AAAA-MM`): transação com evento `reabriu` (motivo, `calculo`, `custoTotal`), `rateioHora.deleteMany`, `fechamentoRateio.delete`.
- [ ] **Step 3:** `recalcularRateioMes({ ano, mes, motivo })`: `motivoParaNaoRecalcular`; calcula com `forcarV2: true`; na mesma transação: evento `recalculou` (motivo, custo antigo em `custoTotal`), apaga linhas e cabeçalho, grava as linhas novas e o cabeçalho com `calculo: "v2"` e `custoTotal` novo, evento `fechou`.
- [ ] **Step 4:** Smoke (banco de dev, cria e limpa os próprios dados num mês do passado distante, ex.: 2030-01 não serve — use um mês já terminado e sem fechamento, ex.: 2026-03): fechar → fechar de novo recusa → reabrir sem motivo recusa → reabrir com motivo apaga e grava evento → fechar de novo; recalcular mês `legado` gera `v2` e dois eventos.
- [ ] **Step 5:** Commit `feat(rateio): fechamento travado, reabertura com motivo e recálculo de mês antigo`.

---

### Task R3.4: Margem com meses abertos e alerta de todos os meses (sessão 3, Opus high)

**Files:**
- Create: `src/modules/projetos/custo-horas.ts` (puro) + teste
- Modify: `src/modules/projetos/queries.ts` (`margemProjeto`), `src/lib/jobs-handlers.ts` (`alertaRateioAberto`), `src/components/projetos/margem-donut.tsx`

**Interfaces — Produces:** `custoHorasDoProjeto(p: { fechadasCent: number; abertosCent: Record<string, number> }): { fechadasCent: number; estimativaCent: number; mesesEstimados: string[]; totalCent: number }`

- [ ] **Step 1:** Teste puro: fechadas 300000 + abertos `{ "2026-10": 80000, "2026-11": 0 }` → total 380000, `mesesEstimados` = `["2026-10"]` (mês com zero não aparece).
- [ ] **Step 2:** `margemProjeto`: meses com sessão do projeto e sem cabeçalho (`SELECT DISTINCT to_char(inicio AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') FROM sessao_trabalho WHERE "projetoId" = $1`, menos os fechados), cada um por `calcularRateioDoMes` filtrado no projeto. A **margem** passa a descontar a estimativa (decisão 18: mostra os meses abertos em vez de zero); `custoHorasMesCorrente` deixa de existir (vira parte de `estimativa`); o retorno ganha `custoHorasEstimadas` e `mesesEstimados`. Ajustar quem lê `custoHorasMesCorrente` (`grep -rn custoHorasMesCorrente src`).
- [ ] **Step 3:** `MargemDonut`: linha "Horas de meses não fechados (estimativa)" com a lista de meses no `title`.
- [ ] **Step 4:** `alertaRateioAberto`: `mesesAbertos({ corte, ate: mês anterior, fechados })`; um aviso com todos ("Rateio em aberto: 10/2026, 11/2026…"), mesmo `tag` por conjunto de meses para não repetir no mesmo dia.
- [ ] **Step 5:** testes de `src/modules/projetos` e `src/lib`, tsc, smoke da R1. Commit `feat(rateio): margem soma os meses abertos e o alerta lista todos`.

---

### Task R3.5: Tela `/rh/rateio` (sessão 4, Sonnet medium)

**Files:**
- Create: `src/app/(dashboard)/rh/rateio/page.tsx`, `src/components/rh/rateio/rateio-meses-view.tsx`, `src/components/rh/rateio/motivo-dialog.tsx`
- Modify: `src/modules/rh/rateio/queries.ts` (`situacaoDosMeses(podeVerCusto)`: últimos 12 meses terminados + meses abertos desde o corte; para cada: fechado, cálculo, custo congelado, custo ao vivo — só dos fechados para a divergência, horas, eventos), `src/lib/nav-config.ts` (item "Rateio de horas", `permissao: "ponto:rateio"`), `src/components/ponto/ponto-view.tsx` (o card ganha link "Gerir fechamentos")

- [ ] **Step 1:** Página com `CabecalhoPagina` ("Rateio de horas", "Fechamento do custo das horas por mês."). Gate: `requirePermission("ponto", "rateio")`.
- [ ] **Step 2:** Tabela de meses: mês, situação ("Aberto", "Fechado (cálculo novo)", "Fechado (cálculo antigo)"), horas, custo (só `podeVerCusto`), "Alterado depois do fechamento: +3h12 / +R$ 410,00" quando `divergencia.alterado`. Cada linha com `LinhaComMenu` + `BotaoAcoes` usando `itensDoMesRateio` (ADR-0002); "Reabrir" e "Recalcular" abrem `MotivoDialog` (textarea, 10+ caracteres, erro em português no rodapé).
- [ ] **Step 3:** "Ver detalhes" abre a lista por projeto e disciplina do mês (horas; reais só com `podeVerCusto`) e o histórico de eventos (quem, quando, motivo).
- [ ] **Step 4:** Navegador (1366 com menu aberto e 390); estados vazio, com divergência e menu aberto.
- [ ] **Step 5:** Commit `feat(rateio): tela de fechamento com reabertura, recálculo e divergência`.

---

### Task R3.6: Troca de contratação no meio do mês (decisão 27) — puro na sessão 2 (Sonnet high), dados na sessão 3 (Opus high)

Pendência G1 da auditoria da R1: hoje `custosDoMes` só calcula o vínculo vigente no fim do mês, e a parte do mês no vínculo anterior (ex.: estágio até 14/10, CLT a partir de 15/10) some do custo.

**Files:**
- Modify: `src/modules/rh/rateio/custo-hora/distribuicao.ts` → `segmentosDoMes(p: { vinculos: { contratacao: Contratacao; dataInicio: string; dataFim: string | null }[]; primeiroDia: string; ultimoDia: string; diasUteis: string[] }): { contratacao: Contratacao; de: string; ate: string; diasUteis: number; vigente: boolean }[]` (um segmento por vínculo que toca o mês, cortado no mês; `vigente` = o que cobre o último dia do mês ou o mais recente)
- Test: casos em `distribuicao.test.ts`: estágio 01–14/10 + CLT 15–31/10 → dois segmentos com os dias úteis de cada; vínculo único → um segmento `vigente`; buraco no meio (sem vínculo de 10 a 14) → dias fora de qualquer segmento não contam.
- Modify: `src/modules/rh/rateio/custo-hora/dados.ts` → para cada segmento com contratação de encargos: `basesDoMes` com `diasUteisNoVinculo` do segmento e o holerite SÓ no segmento `vigente` (decisão 27); salário/bolsa contratual do segmento pelo histórico daquela contratação (`remuneracaoContratual` com a contratação do segmento); tabela da contratação do segmento; soma os `CustoMes` (itens concatenados, `totalCent` somado). A contratação devolvida (para as linhas do rateio) é a do segmento vigente.
- Verificação: script temporário no banco de dev (como na R1) com um estagiário efetivado no dia 15: custo do mês = parte do estágio (bolsa proporcional + recesso + IEL) + parte CLT (salário proporcional + encargos + benefícios proporcionais).

- [ ] Steps: testes puros que falham → `segmentosDoMes` → passa → `dados.ts` → verificação no banco → commit `feat(rateio): troca de contratação no meio do mês divide o custo pelos dias de cada vínculo`.
