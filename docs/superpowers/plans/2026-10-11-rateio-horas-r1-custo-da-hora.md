# Rateio de horas — R1: custo da hora com encargos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o custo da hora "salário ÷ horas" por custo do mês com encargos (tabela versionada por contratação) ÷ horas marcadas, com linha "não alocado", valendo a partir de outubro/2026.

**Architecture:** Duas camadas puras e testadas (`encargos.ts` = custo do mês de uma pessoa; `distribuicao.ts` = divisor, rateio em centavos, recortes de data) e uma camada de I/O (`dados.ts` carrega holerite, histórico, vínculo, férias e tabela; `queries.ts` monta as linhas do mês). Meses antes do corte (`rh.rateio.calculoNovoDesde`) continuam no cálculo antigo; o fechamento grava um cabeçalho `FechamentoRateio` e linhas `RateioHora` com natureza (projeto | reunião | não alocado).

**Tech Stack:** Next.js 15 (Server Actions via `defineAction`), Prisma 7 (client em `@/generated/prisma`), PostgreSQL 17, Zod, Vitest (ambiente node).

**Spec:** [docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md](../specs/2026-09-15-rateio-horas-decisoes.md) — decisões 1 a 24. Este plano cobre a R1 do roteiro abaixo.

## Roteiro completo (cada etapa é um plano próprio, escrito quando a anterior fechar)

| Etapa | Entrega | Decisões |
|---|---|---|
| **R1 (este plano)** | Tabela de encargos versionada, custo do mês por pessoa, divisor por horas marcadas (sócio por jornada de referência), linha "não alocado", sessão recortada no mês, corte de outubro, cabeçalho de fechamento, tela de encargos e agente de integração | 1–8, 9, 15 |
| R2 — Ponto | Reunião ligada a projeto (custo "Reuniões" separado, sem disciplina); `SessaoTrabalho.disciplinaId` vindo da tarefa ou automático; tarefa obrigatória com 2+ disciplinas; validação no servidor de quem pode marcar horas (equipe, responsável, card atribuído; sem disciplina = "coordenação/apoio") | 10, 11, 12 |
| R3 — Fechamento | Fechamento imutável; reabrir com motivo (mesmas pessoas que fecham); botão "recalcular" mês antigo com registro; mês "alterado depois do fechamento" com diferença; alerta varre todos os meses abertos; margem do projeto soma os meses não fechados | 8, 14, 17, 18 |
| R4 — Folha no financeiro | Subcategorias de Folha CLT/Estagiários por `chave`; fechamento da folha lança líquido + INSS + IRRF (dia 20) + FGTS (dia 20) + VT/VR + bolsa; custo total da folha visível só a admin/RH; cópia do holerite assinado antes de reabrir | 17, 20, 21, 22 |
| R5 — Visibilidade e horas | Permissões ver horas × ver custo; papel "coordenador" em lista fixa; orçado (linha de base) × planejado (EAP) × realizado (ponto) por disciplina; histórico de responsáveis por disciplina com datas para correção de ponto | 13, 16, 19 |

Fora do roteiro (depende da `feat/integracao-contabil` entrar no dev): decisões 23 e 24 (conta operacional × administrativa pelo setor; categorias da folha como "não exportar").

## Global Constraints

- Código em inglês onde já é inglês; identificadores do domínio seguem o módulo (português); **todo texto de tela em pt-BR**; commits semânticos em pt-BR.
- Dinheiro em **centavos inteiros** nas camadas puras; percentuais em **pontos-base** (800 = 8%).
- Toda Server Action passa por `defineAction` (`src/lib/with-action.ts`); erro de negócio = `throw new ActionError("…")`.
- Prisma: importar de `@/generated/prisma/client` / `@/generated/prisma/enums`, nunca `@prisma/client`.
- **Nunca** `Promise.all` com o cliente de uma `$transaction` (guarda em `src/lib/promise-all-em-transacao.test.ts`).
- Arquivos puros (`parametros.ts`, `encargos.ts`, `distribuicao.ts`, `src/modules/rh/encargos/regras.ts`) **não importam** Prisma, `server-only` nem Next.
- Banco de dev deste worktree: `senahub_remake_vscode` (porta 5433). Migração **à mão** + `prisma db execute` + `prisma migrate resolve --applied` (o banco tem tabelas de outras branches: `migrate dev` e `db push` apagariam dados).
- Não rodar `next build` com `next dev` ativo na mesma pasta.
- Valores da tabela inicial (vigência 2026-10-01): CLT FGTS 800 bp, multa 4000 bp, INSS empresa 0 bp, reservas de 13º, férias e aviso ligadas, VT R$ 200,00 e VR R$ 550,00 suspensos nas férias; estágio recesso ligado e taxa de agente R$ 85,00; pró-labore INSS empresa 0 bp. Corte do cálculo novo: `2026-10`.

## Modelo e esforço por tarefa

Critério dos planos anteriores: código já escrito no plano e coberto por teste → Sonnet; schema, I/O com regra sutil ou dinheiro que atravessa módulos → Opus. Se a tarefa pede um modelo diferente do que está rodando, **parar e pedir a troca** (`/model`) antes de começar.

| Tarefa | Modelo | Esforço | Por quê |
|---|---|---|---|
| 1 — Custo do mês (puro) | Sonnet 5.5 | high | Código e testes prontos no plano; é dinheiro, então conferir cada centavo dos testes |
| 2 — Distribuição nas horas (puro) | Sonnet 5.5 | high | Código e testes prontos; maior resto e datas de São Paulo pedem atenção |
| 3 — Schema e migração | Opus 5.5 | high | Praticamente irreversível; banco do worktree tem tabelas de outras branches (só `db execute` + `migrate resolve`) |
| 4 — Carregador do custo do mês | Opus 5.5 | high | Junta vínculo, histórico, holerite, férias e calendário; erro aqui não quebra teste, só dá número errado |
| 5 — Cálculo novo, fechamento e leitores | Opus 5.5 | high | Mexe na margem do projeto, no job de alerta e no fechamento; conferir o smoke contra o banco |
| 6 — Tela de encargos | Sonnet 5.5 | medium | Tela e actions no padrão do repo; conferir o `useConfirm` e a tela a 390 px e 1366 px |
| 7 — Docs e verificação final | Sonnet 5.5 | low | Texto pronto no plano; rodar lint, testes, tsc, smoke e build e ler as falhas |
| Revisão final da branch | Opus 5.5 | high | Um revisor independente sobre a R1 inteira antes do merge |

Etapas seguintes do roteiro (planejar cada uma com **Opus 5.5 / high** antes de executar):

| Etapa | Modelo previsto | Esforço | Por quê |
|---|---|---|---|
| R2 — Ponto | Opus 5.5 | high | Validação no servidor de quem marca horas; muda o seletor do ponto e a gravação da sessão |
| R3 — Fechamento | Opus 5.5 | high | Trava, reabertura com motivo e divergência; risco de número de margem mudar sem rastro |
| R4 — Folha no financeiro | Opus 5.5 | xhigh | Toca a máquina de estados do `Lancamento`, a quitação da recorrência e o fechamento da folha |
| R5 — Visibilidade e horas | Opus 5.5 | high | Permissões novas exigem migração por par; histórico de responsáveis muda a correção de ponto |

## Review Focus

1. **Holerite com salário-família:** o item "Salário Família" é reembolsado pelo INSS e não é custo — a base do holerite deve ignorá-lo (teste em `baseDoHoleriteCent`, Task 2).
2. **Troca de vínculo dentro da mesma contratação** (CLT que mudou de setor ganha vínculo novo): o tempo de casa do aviso prévio não pode zerar — conta desde o primeiro vínculo CLT contíguo (teste em `inicioDoTempoDeCasa`, Task 2).
3. **Sócio que aponta mais horas que a jornada de referência:** o custo nos projetos não pode passar do pró-labore — o divisor é o maior entre referência e horas marcadas (teste em `divisorMinutos`/`ratearCusto`, Task 2).
4. **CLT sem nenhuma sessão no mês** (férias o mês inteiro, afastamento): o custo do mês não some — vai inteiro para "não alocado" (teste no smoke da Task 4 e em `ratearCusto` com divisor 0, Task 2).
5. **Sessão que atravessa a virada do mês** (começou 31/10 às 22h, terminou 01/11 às 02h): 2h em outubro, 2h em novembro, nunca as 4h no mês de início (teste em `minutosNoIntervalo`, Task 2).

---

### Task 1: Parâmetros e custo do mês de uma pessoa (puro)

**Files:**
- Create: `src/modules/rh/rateio/custo-hora/parametros.ts`
- Create: `src/modules/rh/rateio/custo-hora/encargos.ts`
- Test: `src/modules/rh/rateio/custo-hora/encargos.test.ts`

**Interfaces:**
- Produces:
  - `parametrosEncargosSchema` (Zod, união discriminada por `tipo`: `"clt" | "estagio" | "pro_labore"`), `type ParametrosEncargos`, `type ParametrosClt`, `type ParametrosEstagio`, `type ParametrosProLabore`
  - `resumoParametros(p: ParametrosEncargos): string`
  - `avisoPrevioMensalCent(baseCent: number, anosCompletos: number): number`
  - `type ItemCusto = { chave: string; rotulo: string; cent: number }`
  - `type EntradaCustoMes = { baseCent: number; parametros: ParametrosEncargos; anosCompletos: number; fracaoForaDeFerias: number; viaAgenteIntegracao: boolean }`
  - `type CustoMes = { baseCent: number; itens: ItemCusto[]; totalCent: number }`
  - `custoDoMes(e: EntradaCustoMes): CustoMes`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/rh/rateio/custo-hora/encargos.test.ts
import { describe, expect, it } from "vitest";
import { avisoPrevioMensalCent, custoDoMes } from "./encargos";
import { parametrosEncargosSchema, resumoParametros, type ParametrosClt } from "./parametros";

const CLT: ParametrosClt = {
  tipo: "clt",
  fgtsBp: 800,
  multaFgtsBp: 4000,
  inssEmpresaBp: 0,
  reservaDecimoTerceiro: true,
  reservaFerias: true,
  reservaAvisoPrevio: true,
  beneficios: [
    { nome: "Vale-transporte", valorCent: 20000, suspensoNasFerias: true },
    { nome: "Vale-refeição", valorCent: 55000, suspensoNasFerias: true },
  ],
};

const cent = (c: ReturnType<typeof custoDoMes>, chave: string) => c.itens.find((i) => i.chave === chave)?.cent ?? 0;

describe("custoDoMes — CLT", () => {
  it("salário de R$ 4.000 no 1º ano: tabela da decisão 4 + aviso + benefícios", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(cent(c, "fgts")).toBe(32000);
    expect(cent(c, "decimo_terceiro")).toBe(33333);
    expect(cent(c, "ferias")).toBe(44444);
    expect(cent(c, "fgts_provisoes")).toBe(6222);
    expect(cent(c, "multa_fgts")).toBe(15289);
    expect(cent(c, "aviso_previo")).toBe(33333);
    expect(cent(c, "beneficio_0")).toBe(20000);
    expect(cent(c, "beneficio_1")).toBe(55000);
    expect(c.totalCent).toBe(639621);
  });

  it("encargos sem aviso e benefícios somam 32,82% do salário", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    const soma = ["fgts", "decimo_terceiro", "ferias", "fgts_provisoes", "multa_fgts"].reduce((s, k) => s + cent(c, k), 0);
    expect(soma).toBe(131288);
  });

  it("benefício suspenso nas férias entra proporcional", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 0.5, viaAgenteIntegracao: false });
    expect(cent(c, "beneficio_0")).toBe(10000);
    expect(cent(c, "beneficio_1")).toBe(27500);
  });

  it("INSS da empresa só aparece quando a tabela tem alíquota (Anexo IV)", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: { ...CLT, inssEmpresaBp: 2000 }, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    // 20% sobre salário + 13º + férias = 0,2 × (400000 + 33333 + 44444)
    expect(cent(c, "inss_empresa")).toBe(95555);
  });

  it("item com valor zero não aparece na lista", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(c.itens.some((i) => i.chave === "inss_empresa")).toBe(false);
  });
});

describe("avisoPrevioMensalCent", () => {
  it("1º ano: 1/12 do salário", () => expect(avisoPrevioMensalCent(400000, 0)).toBe(33333));
  it("depois do 1º ano: só o acréscimo de 3 dias por ano (1/120)", () => expect(avisoPrevioMensalCent(400000, 3)).toBe(3333));
  it("ainda acumula enquanto 30 + 3 × anos ≤ 90", () => expect(avisoPrevioMensalCent(400000, 20)).toBe(3333));
  it("para quando passaria de 90 dias", () => expect(avisoPrevioMensalCent(400000, 21)).toBe(0));
});

describe("custoDoMes — estágio e pró-labore", () => {
  const EST = { tipo: "estagio" as const, reservaRecesso: true, taxaAgenteCent: 8500 };

  it("estagiário pelo agente: bolsa + recesso 1/12 + taxa", () => {
    const c = custoDoMes({ baseCent: 150000, parametros: EST, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: true });
    expect(cent(c, "recesso")).toBe(12500);
    expect(cent(c, "taxa_agente")).toBe(8500);
    expect(c.totalCent).toBe(171000);
  });

  it("estagiário contratado direto não tem taxa", () => {
    const c = custoDoMes({ baseCent: 150000, parametros: EST, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(c.totalCent).toBe(162500);
  });

  it("pró-labore: só o bruto quando o INSS da empresa está no DAS", () => {
    const c = custoDoMes({ baseCent: 1000000, parametros: { tipo: "pro_labore", inssEmpresaBp: 0 }, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(c.totalCent).toBe(1000000);
    expect(c.itens).toHaveLength(0);
  });
});

describe("parametrosEncargosSchema", () => {
  it("aceita a tabela CLT e recusa percentual fora de 0–100%", () => {
    expect(parametrosEncargosSchema.safeParse(CLT).success).toBe(true);
    expect(parametrosEncargosSchema.safeParse({ ...CLT, fgtsBp: 10001 }).success).toBe(false);
  });

  it("resumo legível para a tela", () => {
    expect(resumoParametros(CLT)).toBe("FGTS 8% · multa 40% · INSS empresa 0% · 13º, férias e aviso prévio · Vale-transporte R$ 200,00 · Vale-refeição R$ 550,00");
    expect(resumoParametros({ tipo: "estagio", reservaRecesso: true, taxaAgenteCent: 8500 })).toBe("Recesso · taxa do agente R$ 85,00");
    expect(resumoParametros({ tipo: "pro_labore", inssEmpresaBp: 0 })).toBe("INSS empresa 0%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/rh/rateio/custo-hora/encargos.test.ts`
Expected: FAIL — `Failed to resolve import "./encargos"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/rh/rateio/custo-hora/parametros.ts
/**
 * Parâmetros da tabela de encargos de uma contratação (decisões 2–6 de
 * docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md). PURO: roda no navegador (formulário)
 * e no servidor (cálculo). Percentual em pontos-base, dinheiro em centavos.
 */
import { z } from "zod";

const bp = z.number().int().min(0).max(10000);

export const beneficioSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao benefício."),
  valorCent: z.number().int().nonnegative(),
  /** Não é pago nas férias: no mês com férias entra proporcional aos dias úteis fora delas. */
  suspensoNasFerias: z.boolean(),
});

export const parametrosCltSchema = z.object({
  tipo: z.literal("clt"),
  fgtsBp: bp,
  multaFgtsBp: bp,
  /** Zero no Anexo III/V (o INSS da empresa vem no DAS). */
  inssEmpresaBp: bp,
  reservaDecimoTerceiro: z.boolean(),
  reservaFerias: z.boolean(),
  reservaAvisoPrevio: z.boolean(),
  beneficios: z.array(beneficioSchema),
});

export const parametrosEstagioSchema = z.object({
  tipo: z.literal("estagio"),
  reservaRecesso: z.boolean(),
  /** Taxa mensal do agente de integração (IEL). Só vale para o vínculo com agente. */
  taxaAgenteCent: z.number().int().nonnegative(),
});

export const parametrosProLaboreSchema = z.object({
  tipo: z.literal("pro_labore"),
  inssEmpresaBp: bp,
});

export const parametrosEncargosSchema = z.discriminatedUnion("tipo", [
  parametrosCltSchema,
  parametrosEstagioSchema,
  parametrosProLaboreSchema,
]);

export type ParametrosClt = z.infer<typeof parametrosCltSchema>;
export type ParametrosEstagio = z.infer<typeof parametrosEstagioSchema>;
export type ParametrosProLabore = z.infer<typeof parametrosProLaboreSchema>;
export type ParametrosEncargos = z.infer<typeof parametrosEncargosSchema>;

/** Contratações que têm tabela de encargos. PJ e autônomo entram só com horas (decisão 7). */
export const CONTRATACOES_COM_ENCARGOS = ["clt", "estagio", "pro_labore"] as const;
export type ContratacaoComEncargos = (typeof CONTRATACOES_COM_ENCARGOS)[number];

const pctTexto = (b: number) => `${(b / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Uma linha que descreve a versão da tabela, para a lista da tela. */
export function resumoParametros(p: ParametrosEncargos): string {
  if (p.tipo === "clt") {
    const reservas = [p.reservaDecimoTerceiro && "13º", p.reservaFerias && "férias", p.reservaAvisoPrevio && "aviso prévio"].filter(Boolean) as string[];
    const reservasTxt = reservas.length === 0 ? null : reservas.length === 1 ? reservas[0] : `${reservas.slice(0, -1).join(", ")} e ${reservas[reservas.length - 1]}`;
    return [
      `FGTS ${pctTexto(p.fgtsBp)}`,
      `multa ${pctTexto(p.multaFgtsBp)}`,
      `INSS empresa ${pctTexto(p.inssEmpresaBp)}`,
      reservasTxt,
      ...p.beneficios.map((b) => `${b.nome} ${reais(b.valorCent)}`),
    ].filter(Boolean).join(" · ");
  }
  if (p.tipo === "estagio") {
    return [p.reservaRecesso ? "Recesso" : null, `taxa do agente ${reais(p.taxaAgenteCent)}`].filter(Boolean).join(" · ");
  }
  return `INSS empresa ${pctTexto(p.inssEmpresaBp)}`;
}
```

```ts
// src/modules/rh/rateio/custo-hora/encargos.ts
/**
 * Custo do mês de UMA pessoa = base (holerite ou cadastro) + encargos da tabela vigente
 * (decisões 3–6 e a tabela da decisão 4 do spec). PURO e em centavos: cada item é arredondado
 * sozinho, e a multa do FGTS usa os FGTS já arredondados — é a mesma conta que o RH refaz à mão.
 */
import type { ParametrosEncargos } from "./parametros";

export type ItemCusto = { chave: string; rotulo: string; cent: number };

export type EntradaCustoMes = {
  baseCent: number;
  parametros: ParametrosEncargos;
  /** Anos completos de casa no fim do mês (aviso prévio). */
  anosCompletos: number;
  /** Dias úteis fora de férias ÷ dias úteis do mês (0 a 1). */
  fracaoForaDeFerias: number;
  /** Estagiário contratado por agente de integração (paga a taxa). */
  viaAgenteIntegracao: boolean;
};

export type CustoMes = { baseCent: number; itens: ItemCusto[]; totalCent: number };

const pct = (cent: number, bp: number) => Math.round((cent * bp) / 10000);

/**
 * Reserva mensal do aviso prévio (decisão 4, pergunta 42 = b). Aviso = salário ÷ 30 × (30 + 3 ×
 * anos completos), teto de 90 dias. No 1º ano reserva 1/12 do aviso de 30 dias; depois, só o
 * acréscimo de 3 dias por ano (salário ÷ 120 por mês), enquanto o total não passar de 90 dias.
 */
export function avisoPrevioMensalCent(baseCent: number, anosCompletos: number): number {
  if (anosCompletos < 1) return Math.round(baseCent / 12);
  if (30 + 3 * anosCompletos > 90) return 0;
  return Math.round(baseCent / 120);
}

export function custoDoMes(e: EntradaCustoMes): CustoMes {
  const base = Math.max(0, Math.round(e.baseCent));
  const itens: ItemCusto[] = [];
  const add = (chave: string, rotulo: string, cent: number) => {
    if (cent > 0) itens.push({ chave, rotulo, cent });
  };
  const p = e.parametros;

  if (p.tipo === "clt") {
    const fgts = pct(base, p.fgtsBp);
    const decimo = p.reservaDecimoTerceiro ? Math.round(base / 12) : 0;
    // Férias + 1/3 por mês = (salário + salário/3) ÷ 12 = salário ÷ 9.
    const ferias = p.reservaFerias ? Math.round(base / 9) : 0;
    const fgtsProvisoes = pct(decimo + ferias, p.fgtsBp);
    add("fgts", "FGTS", fgts);
    add("decimo_terceiro", "Reserva de 13º", decimo);
    add("ferias", "Reserva de férias + 1/3", ferias);
    add("fgts_provisoes", "FGTS sobre 13º e férias", fgtsProvisoes);
    add("multa_fgts", "Multa de 40% do FGTS", pct(fgts + fgtsProvisoes, p.multaFgtsBp));
    add("inss_empresa", "INSS da empresa", pct(base + decimo + ferias, p.inssEmpresaBp));
    if (p.reservaAvisoPrevio) add("aviso_previo", "Reserva de aviso prévio", avisoPrevioMensalCent(base, e.anosCompletos));
    const fracao = Math.min(1, Math.max(0, e.fracaoForaDeFerias));
    p.beneficios.forEach((b, i) => add(`beneficio_${i}`, b.nome, Math.round(b.valorCent * (b.suspensoNasFerias ? fracao : 1))));
  } else if (p.tipo === "estagio") {
    if (p.reservaRecesso) add("recesso", "Reserva de recesso", Math.round(base / 12));
    if (e.viaAgenteIntegracao) add("taxa_agente", "Taxa do agente de integração", p.taxaAgenteCent);
  } else {
    add("inss_empresa", "INSS da empresa", pct(base, p.inssEmpresaBp));
  }

  return { baseCent: base, itens, totalCent: base + itens.reduce((s, i) => s + i.cent, 0) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/rh/rateio/custo-hora/encargos.test.ts`
Expected: PASS (todos os casos). Se `resumoParametros` falhar só por espaço do `toLocaleString`, conferir o `replace(/ /g, " ")`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/rh/rateio/custo-hora/parametros.ts src/modules/rh/rateio/custo-hora/encargos.ts src/modules/rh/rateio/custo-hora/encargos.test.ts
git commit -m "feat(rateio): custo do mês por pessoa com tabela de encargos (puro)"
```

---

### Task 2: Distribuição do custo nas horas (puro)

**Files:**
- Create: `src/modules/rh/rateio/custo-hora/distribuicao.ts`
- Test: `src/modules/rh/rateio/custo-hora/distribuicao.test.ts`

**Interfaces:**
- Consumes: nada das outras tasks (só `somarDias` de `@/lib/dias-iso` e o tipo `Contratacao`).
- Produces:
  - `NAO_APONTADO: string`
  - `type NaturezaLinha = "projeto" | "reuniao" | "nao_alocado"`
  - `naturezaDaSessao(projetoId: string | null, tipo: "projeto" | "sem_projeto" | "reuniao_interna" | "reuniao_externa"): NaturezaLinha`
  - `limitesDoMesSP(ano: number, mes: number): { inicio: Date; fim: Date }`
  - `minutosNoIntervalo(inicio: Date, fim: Date | null, de: Date, ate: Date, agora: Date): number`
  - `divisorMinutos(p: { contratacao: Contratacao | null; minutosMarcados: number; jornadaReferenciaMin: number }): number`
  - `jornadaReferenciaMinutos(cargaSemanalHoras: number | null, diasUteis: number): number`
  - `ratearCusto(totalCent: number, divisorMin: number, linhas: { chave: string; minutos: number }[]): { porLinha: Map<string, number>; naoApontadoCent: number }`
  - `anosCompletos(inicioIso: string, refIso: string): number`
  - `inicioDoTempoDeCasa(vinculos: { contratacao: Contratacao; dataInicio: string; dataFim: string | null }[], contratacao: Contratacao, refIso: string): string | null`
  - `fracaoForaDeFerias(diasUteisMes: number, diasUteisEmFerias: number): number`
  - `tabelaVigente<T extends { vigenciaEm: string }>(versoes: T[], primeiroDiaIso: string): { versao: T; posterior: boolean } | null`
  - `baseDoHoleriteCent(itens: { tipo: "provento" | "desconto"; valorCent: number; descricao: string }[]): number`
  - `calculoDoMes(ano: number, mes: number, corte: string): "legado" | "v2"`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/rh/rateio/custo-hora/distribuicao.test.ts
import { describe, expect, it } from "vitest";
import {
  anosCompletos, baseDoHoleriteCent, calculoDoMes, divisorMinutos, fracaoForaDeFerias, inicioDoTempoDeCasa,
  jornadaReferenciaMinutos, limitesDoMesSP, minutosNoIntervalo, naturezaDaSessao, ratearCusto, tabelaVigente,
} from "./distribuicao";

describe("ratearCusto", () => {
  it("CLT: o custo do mês inteiro vai para as horas marcadas, centavo a centavo", () => {
    const r = ratearCusto(639621, 9600, [
      { chave: "a", minutos: 6000 },
      { chave: "b", minutos: 3000 },
      { chave: "c", minutos: 600 },
    ]);
    expect(r.porLinha.get("a")).toBe(399763);
    expect(r.porLinha.get("b")).toBe(199882);
    expect(r.porLinha.get("c")).toBe(39976);
    expect(r.naoApontadoCent).toBe(0);
  });

  it("sócio: o que passa da jornada de referência vira 'não apontado'", () => {
    const r = ratearCusto(1000000, 9600, [{ chave: "p", minutos: 2400 }]);
    expect(r.porLinha.get("p")).toBe(250000);
    expect(r.naoApontadoCent).toBe(750000);
  });

  it("sem horas: o custo inteiro fica fora dos projetos", () => {
    const r = ratearCusto(500000, 0, []);
    expect(r.naoApontadoCent).toBe(500000);
  });

  it("divisor menor que as horas marcadas nunca reparte mais que o total", () => {
    const r = ratearCusto(1000, 60, [{ chave: "a", minutos: 90 }, { chave: "b", minutos: 30 }]);
    expect((r.porLinha.get("a") ?? 0) + (r.porLinha.get("b") ?? 0) + r.naoApontadoCent).toBe(1000);
  });
});

describe("divisorMinutos", () => {
  it("CLT e estágio dividem pelas horas marcadas", () => {
    expect(divisorMinutos({ contratacao: "clt", minutosMarcados: 12000, jornadaReferenciaMin: 9600 })).toBe(12000);
  });
  it("sócio divide pela jornada de referência", () => {
    expect(divisorMinutos({ contratacao: "pro_labore", minutosMarcados: 2400, jornadaReferenciaMin: 9600 })).toBe(9600);
  });
  it("sócio que apontou mais que a referência divide pelo apontado (o custo nunca passa do pró-labore)", () => {
    expect(divisorMinutos({ contratacao: "pro_labore", minutosMarcados: 12000, jornadaReferenciaMin: 9600 })).toBe(12000);
  });
});

describe("jornadaReferenciaMinutos", () => {
  it("40h semanais em 20 dias úteis = 160h", () => expect(jornadaReferenciaMinutos(40, 20)).toBe(9600));
  it("sem carga cadastrada usa 40h", () => expect(jornadaReferenciaMinutos(null, 20)).toBe(9600));
  it("30h semanais em 22 dias úteis = 132h", () => expect(jornadaReferenciaMinutos(30, 22)).toBe(7920));
});

describe("minutosNoIntervalo e limitesDoMesSP", () => {
  const out = limitesDoMesSP(2026, 10);
  const nov = limitesDoMesSP(2026, 11);
  const agora = new Date("2026-12-01T12:00:00-03:00");
  const ini = new Date("2026-10-31T22:00:00-03:00");
  const fim = new Date("2026-11-01T02:00:00-03:00");

  it("limites do mês em horário de São Paulo", () => {
    expect(out.inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(out.fim.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(limitesDoMesSP(2026, 12).fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
  it("sessão que vira o mês é cortada: 2h em outubro e 2h em novembro", () => {
    expect(minutosNoIntervalo(ini, fim, out.inicio, out.fim, agora)).toBe(120);
    expect(minutosNoIntervalo(ini, fim, nov.inicio, nov.fim, agora)).toBe(120);
  });
  it("sessão aberta conta até agora", () => {
    const a = new Date("2026-10-10T08:00:00-03:00");
    expect(minutosNoIntervalo(a, null, out.inicio, out.fim, new Date("2026-10-10T09:30:00-03:00"))).toBe(90);
  });
  it("sessão fora do mês dá zero", () => {
    expect(minutosNoIntervalo(new Date("2026-09-01T08:00:00-03:00"), new Date("2026-09-01T09:00:00-03:00"), out.inicio, out.fim, agora)).toBe(0);
  });
});

describe("naturezaDaSessao", () => {
  it("separa projeto, reunião com projeto e o resto", () => {
    expect(naturezaDaSessao("p1", "projeto")).toBe("projeto");
    expect(naturezaDaSessao("p1", "reuniao_externa")).toBe("reuniao");
    expect(naturezaDaSessao(null, "reuniao_interna")).toBe("nao_alocado");
    expect(naturezaDaSessao(null, "sem_projeto")).toBe("nao_alocado");
  });
});

describe("tempo de casa", () => {
  it("anos completos respeitam o dia do aniversário", () => {
    expect(anosCompletos("2023-11-15", "2026-11-14")).toBe(2);
    expect(anosCompletos("2023-11-15", "2026-11-15")).toBe(3);
    expect(anosCompletos("2026-10-01", "2026-10-31")).toBe(0);
  });
  it("troca de setor no mesmo CLT não zera o tempo de casa", () => {
    const vinculos = [
      { contratacao: "clt" as const, dataInicio: "2022-03-01", dataFim: "2025-06-30" },
      { contratacao: "clt" as const, dataInicio: "2025-07-01", dataFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2022-03-01");
  });
  it("estágio antes do CLT não conta", () => {
    const vinculos = [
      { contratacao: "estagio" as const, dataInicio: "2024-01-01", dataFim: "2025-12-31" },
      { contratacao: "clt" as const, dataInicio: "2026-01-01", dataFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2026-01-01");
  });
  it("buraco entre vínculos recomeça a contagem", () => {
    const vinculos = [
      { contratacao: "clt" as const, dataInicio: "2020-01-01", dataFim: "2021-12-31" },
      { contratacao: "clt" as const, dataInicio: "2023-01-01", dataFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2023-01-01");
  });
});

describe("fracaoForaDeFerias", () => {
  it("metade do mês em férias", () => expect(fracaoForaDeFerias(22, 11)).toBe(0.5));
  it("mês sem dia útil não divide por zero", () => expect(fracaoForaDeFerias(0, 0)).toBe(1));
});

describe("tabelaVigente", () => {
  const v = [{ vigenciaEm: "2026-10-01", id: "a" }, { vigenciaEm: "2027-01-01", id: "b" }];
  it("pega a última com vigência até o mês", () => expect(tabelaVigente(v, "2026-12-01")?.versao.id).toBe("a"));
  it("mês da troca já usa a nova", () => expect(tabelaVigente(v, "2027-01-01")?.versao.id).toBe("b"));
  it("mês anterior a todas usa a primeira e avisa", () => expect(tabelaVigente(v, "2026-08-01")).toEqual({ versao: v[0], posterior: true }));
  it("sem versão nenhuma", () => expect(tabelaVigente([], "2026-10-01")).toBeNull());
});

describe("baseDoHoleriteCent", () => {
  it("soma proventos e ignora descontos e salário-família", () => {
    expect(baseDoHoleriteCent([
      { tipo: "provento", valorCent: 364665, descricao: "Salário Base" },
      { tipo: "provento", valorCent: 20000, descricao: "Horas extras 50%" },
      { tipo: "provento", valorCent: 6553, descricao: "Salário Família" },
      { tipo: "provento", valorCent: 6553, descricao: "SAL. FAMILIA" },
      { tipo: "desconto", valorCent: 30000, descricao: "INSS" },
    ])).toBe(384665);
  });
});

describe("calculoDoMes", () => {
  it("antes do corte é o cálculo antigo", () => expect(calculoDoMes(2026, 9, "2026-10")).toBe("legado"));
  it("a partir do corte é o novo", () => expect(calculoDoMes(2026, 10, "2026-10")).toBe("v2"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/rh/rateio/custo-hora/distribuicao.test.ts`
Expected: FAIL — `Failed to resolve import "./distribuicao"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/rh/rateio/custo-hora/distribuicao.ts
/**
 * Como o custo do mês de uma pessoa se espalha pelas horas (decisões 1, 6, 9 e 15 do spec
 * 2026-09-15-rateio-horas-decisoes.md). PURO: datas de calendário em ISO, instantes em Date,
 * dinheiro em centavos.
 */
import type { Contratacao } from "@/generated/prisma/enums";
import { somarDias } from "@/lib/dias-iso";

/** Chave interna da parte do divisor que ninguém apontou (só existe no sócio). */
export const NAO_APONTADO = "__nao_apontado";

export type NaturezaLinha = "projeto" | "reuniao" | "nao_alocado";

export function naturezaDaSessao(
  projetoId: string | null,
  tipo: "projeto" | "sem_projeto" | "reuniao_interna" | "reuniao_externa",
): NaturezaLinha {
  if (!projetoId) return "nao_alocado";
  return tipo === "reuniao_interna" || tipo === "reuniao_externa" ? "reuniao" : "projeto";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Início (inclusivo) e fim (exclusivo) do mês no fuso de São Paulo (UTC−3, sem horário de verão). */
export function limitesDoMesSP(ano: number, mes: number): { inicio: Date; fim: Date } {
  const prox = mes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: mes + 1 };
  return {
    inicio: new Date(`${ano}-${pad(mes)}-01T00:00:00-03:00`),
    fim: new Date(`${prox.a}-${pad(prox.m)}-01T00:00:00-03:00`),
  };
}

/** Minutos da sessão que caem dentro de [de, ate). Sessão aberta conta até `agora`. */
export function minutosNoIntervalo(inicio: Date, fim: Date | null, de: Date, ate: Date, agora: Date): number {
  const a = Math.max(inicio.getTime(), de.getTime());
  const b = Math.min((fim ?? agora).getTime(), ate.getTime());
  return b > a ? Math.round((b - a) / 60000) : 0;
}

/**
 * Por quantos minutos dividir o custo do mês. CLT e estágio: pelas horas marcadas (decisão 1).
 * Sócio: pela jornada de referência (decisão 6) — ou pelo apontado, se passou dela, para o custo
 * nos projetos nunca superar o pró-labore.
 */
export function divisorMinutos(p: { contratacao: Contratacao | null; minutosMarcados: number; jornadaReferenciaMin: number }): number {
  if (p.contratacao === "pro_labore") return Math.max(p.jornadaReferenciaMin, p.minutosMarcados);
  return p.minutosMarcados;
}

/** Jornada de referência do mês = carga semanal ÷ 5 × dias úteis (sem carga cadastrada: 40h). */
export function jornadaReferenciaMinutos(cargaSemanalHoras: number | null, diasUteis: number): number {
  const semanal = cargaSemanalHoras && cargaSemanalHoras > 0 ? cargaSemanalHoras : 40;
  return Math.round((semanal / 5) * 60 * diasUteis);
}

/**
 * Reparte `totalCent` proporcionalmente aos minutos de cada linha, com o divisor dado. O que o
 * divisor tem além das linhas vira `naoApontadoCent`. Maior resto: a soma bate no centavo.
 */
export function ratearCusto(
  totalCent: number,
  divisorMin: number,
  linhas: { chave: string; minutos: number }[],
): { porLinha: Map<string, number>; naoApontadoCent: number } {
  const porLinha = new Map<string, number>();
  for (const l of linhas) porLinha.set(l.chave, 0);
  const total = Math.max(0, Math.round(totalCent));
  const soma = linhas.reduce((s, l) => s + Math.max(0, l.minutos), 0);
  const divisor = Math.max(divisorMin, soma);
  if (total === 0 || divisor <= 0) return { porLinha, naoApontadoCent: total };

  const partes = [...linhas.map((l) => ({ chave: l.chave, minutos: Math.max(0, l.minutos) })), { chave: NAO_APONTADO, minutos: divisor - soma }];
  const exatos = partes.map((p) => (total * p.minutos) / divisor);
  const cents = exatos.map((v) => Math.floor(v));
  let sobra = total - cents.reduce((s, v) => s + v, 0);
  const ordem = exatos.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((x, y) => y.frac - x.frac || x.i - y.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    cents[i]++;
    sobra--;
  }
  partes.forEach((p, i) => {
    if (p.chave !== NAO_APONTADO) porLinha.set(p.chave, (porLinha.get(p.chave) ?? 0) + cents[i]);
  });
  return { porLinha, naoApontadoCent: cents[cents.length - 1] };
}

/** Anos completos entre duas datas ISO (o aniversário conta no próprio dia). */
export function anosCompletos(inicioIso: string, refIso: string): number {
  const [ai, mi, di] = inicioIso.split("-").map(Number);
  const [ar, mr, dr] = refIso.split("-").map(Number);
  let anos = ar - ai;
  if (mr < mi || (mr === mi && dr < di)) anos--;
  return Math.max(0, anos);
}

/**
 * Início do tempo de casa na contratação: o vínculo que cobre `refIso` e os anteriores da MESMA
 * contratação colados nele (fim = véspera do início do seguinte). Troca de setor abre vínculo
 * novo sem mudar a contratação, e não pode zerar o aviso prévio.
 */
export function inicioDoTempoDeCasa(
  vinculos: { contratacao: Contratacao; dataInicio: string; dataFim: string | null }[],
  contratacao: Contratacao,
  refIso: string,
): string | null {
  const ord = vinculos
    .filter((v) => v.contratacao === contratacao && v.dataInicio <= refIso)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  if (ord.length === 0) return null;
  let inicio = ord[0].dataInicio;
  for (let i = 1; i < ord.length; i++) {
    if (ord[i].dataFim !== somarDias(inicio, -1)) break;
    inicio = ord[i].dataInicio;
  }
  return inicio;
}

export function fracaoForaDeFerias(diasUteisMes: number, diasUteisEmFerias: number): number {
  if (diasUteisMes <= 0) return 1;
  return Math.min(1, Math.max(0, (diasUteisMes - diasUteisEmFerias) / diasUteisMes));
}

/**
 * Versão da tabela que vale no mês (vigência sempre no dia 1º). Sem versão até o mês (só ao
 * recalcular mês anterior à primeira tabela), usa a primeira e devolve `posterior: true`.
 */
export function tabelaVigente<T extends { vigenciaEm: string }>(versoes: T[], primeiroDiaIso: string): { versao: T; posterior: boolean } | null {
  if (versoes.length === 0) return null;
  const ord = [...versoes].sort((a, b) => a.vigenciaEm.localeCompare(b.vigenciaEm));
  const ate = ord.filter((v) => v.vigenciaEm <= primeiroDiaIso);
  if (ate.length > 0) return { versao: ate[ate.length - 1], posterior: false };
  return { versao: ord[0], posterior: true };
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Base do custo pelo holerite: soma dos proventos. Salário-família fica fora — a empresa paga e
 * desconta da guia do INSS, então não é custo.
 */
export function baseDoHoleriteCent(itens: { tipo: "provento" | "desconto"; valorCent: number; descricao: string }[]): number {
  return itens
    .filter((i) => i.tipo === "provento")
    .filter((i) => {
      const d = semAcento(i.descricao);
      return !d.includes("salario familia") && !d.includes("sal. familia");
    })
    .reduce((s, i) => s + i.valorCent, 0);
}

/** Meses a partir do corte (`AAAA-MM`) usam o cálculo novo (decisão 8). */
export function calculoDoMes(ano: number, mes: number, corte: string): "legado" | "v2" {
  return `${ano}-${pad(mes)}` >= corte ? "v2" : "legado";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/rh/rateio/custo-hora/distribuicao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/rh/rateio/custo-hora/distribuicao.ts src/modules/rh/rateio/custo-hora/distribuicao.test.ts
git commit -m "feat(rateio): divisor, rateio em centavos e recorte do mês (puro)"
```

---

### Task 3: Schema e migração

**Files:**
- Modify: `prisma/schema.prisma` (models `RateioHora`, `User`, `Vinculo`; novos `FechamentoRateio`, `TabelaEncargos`, enum `NaturezaRateio`)
- Create: `prisma/migrations/20261011120000_rateio_custo_hora_v2/migration.sql`

**Interfaces:**
- Produces: `prisma.tabelaEncargos` (`contratacao`, `vigenciaEm`, `parametros`, `observacao`, `autorId`), `prisma.fechamentoRateio` (`ano`, `mes`, `calculo`, `fechadoEm`, `fechadoPorId`; único `ano_mes`), `RateioHora.projetoId` opcional + `natureza` + `contratacao`, `Vinculo.agenteIntegracao`, `ConfigSistema` `rh.rateio.calculoNovoDesde = "2026-10"`.

- [ ] **Step 1: Editar o schema**

Em `model RateioHora`, trocar o bloco por:

```prisma
/// Rateio mensal do custo de horas (Fluxo C: ponto → custo → margem). Snapshot do mês fechado.
/// Desde a R1 (spec 2026-09-15-rateio-horas-decisoes.md): uma linha por pessoa × projeto × natureza,
/// e a linha "não alocado" (projetoId nulo) com o custo que não foi para projeto nenhum.
model RateioHora {
  id          String          @id @default(cuid())
  userId      String
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  projetoId   String?
  projeto     Projeto?        @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  natureza    NaturezaRateio  @default(projeto)
  /// Contratação de quem apontou NO MÊS (foto; o cache do usuário muda com o tempo).
  contratacao Contratacao?
  ano         Int
  mes         Int
  minutos     Int
  /// Custo/hora usado no fechamento.
  custoHora   Decimal         @db.Decimal(10, 2)
  /// Custo da linha.
  custo       Decimal         @db.Decimal(12, 2)
  fechadoEm   DateTime        @default(now())

  @@index([projetoId, ano, mes])
  @@index([ano, mes])
  @@map("rateio_hora")
}

enum NaturezaRateio {
  projeto
  reuniao
  nao_alocado
}

/// Cabeçalho do fechamento do rateio de um mês — existe mesmo quando o mês não tem linha.
/// `calculo`: "legado" (salário ÷ horas, meses antes do corte) ou "v2" (custo com encargos).
model FechamentoRateio {
  id           String   @id @default(cuid())
  ano          Int
  mes          Int
  calculo      String
  fechadoEm    DateTime @default(now())
  fechadoPorId String?
  fechadoPor   User?    @relation("FechamentoRateioAutor", fields: [fechadoPorId], references: [id], onDelete: SetNull)

  @@unique([ano, mes])
  @@index([fechadoPorId])
  @@map("fechamento_rateio")
}

/// Versão da tabela de encargos de uma contratação, valendo a partir de `vigenciaEm` (sempre dia 1º).
/// `parametros` segue `parametrosEncargosSchema` (modules/rh/rateio/custo-hora/parametros.ts).
model TabelaEncargos {
  id          String      @id @default(cuid())
  contratacao Contratacao
  vigenciaEm  DateTime    @db.Date
  parametros  Json
  observacao  String?
  autorId     String?
  autor       User?       @relation("TabelaEncargosAutor", fields: [autorId], references: [id], onDelete: SetNull)
  criadoEm    DateTime    @default(now())

  @@unique([contratacao, vigenciaEm])
  @@index([autorId])
  @@map("tabela_encargos")
}
```

Em `model User`, junto das outras relações, acrescentar:

```prisma
  fechamentosRateio FechamentoRateio[] @relation("FechamentoRateioAutor")
  tabelasEncargos   TabelaEncargos[]   @relation("TabelaEncargosAutor")
```

Em `model Vinculo`, depois de `pjId`/`pj`, acrescentar:

```prisma
  /// Agente de integração do estágio ("IEL"). Nulo = contratação direta, sem taxa (decisão 5).
  agenteIntegracao String?
```

- [ ] **Step 2: Escrever a migração**

```sql
-- prisma/migrations/20261011120000_rateio_custo_hora_v2/migration.sql
-- Rateio de horas R1 (spec docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md).

-- Linhas do rateio: projeto opcional (linha "não alocado"), natureza e contratação do mês.
CREATE TYPE "NaturezaRateio" AS ENUM ('projeto', 'reuniao', 'nao_alocado');
ALTER TABLE "rateio_hora" ADD COLUMN "natureza" "NaturezaRateio" NOT NULL DEFAULT 'projeto';
ALTER TABLE "rateio_hora" ADD COLUMN "contratacao" "Contratacao";
ALTER TABLE "rateio_hora" ALTER COLUMN "projetoId" DROP NOT NULL;
DROP INDEX IF EXISTS "rateio_hora_userId_projetoId_ano_mes_key";
CREATE INDEX "rateio_hora_ano_mes_idx" ON "rateio_hora"("ano", "mes");
UPDATE "rateio_hora" r SET "contratacao" = u."contratacao" FROM "user" u WHERE u."id" = r."userId";

-- Cabeçalho do fechamento; os meses já fechados viram "legado".
CREATE TABLE "fechamento_rateio" (
  "id" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "calculo" TEXT NOT NULL,
  "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechadoPorId" TEXT,
  CONSTRAINT "fechamento_rateio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fechamento_rateio_ano_mes_key" ON "fechamento_rateio"("ano", "mes");
CREATE INDEX "fechamento_rateio_fechadoPorId_idx" ON "fechamento_rateio"("fechadoPorId");
ALTER TABLE "fechamento_rateio" ADD CONSTRAINT "fechamento_rateio_fechadoPorId_fkey"
  FOREIGN KEY ("fechadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "fechamento_rateio" ("id", "ano", "mes", "calculo", "fechadoEm")
SELECT 'fr_' || "ano" || '_' || "mes", "ano", "mes", 'legado', MAX("fechadoEm")
FROM "rateio_hora" GROUP BY "ano", "mes";

-- Tabela de encargos versionada + versão inicial (respostas de 10/10/2026).
CREATE TABLE "tabela_encargos" (
  "id" TEXT NOT NULL,
  "contratacao" "Contratacao" NOT NULL,
  "vigenciaEm" DATE NOT NULL,
  "parametros" JSONB NOT NULL,
  "observacao" TEXT,
  "autorId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tabela_encargos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tabela_encargos_contratacao_vigenciaEm_key" ON "tabela_encargos"("contratacao", "vigenciaEm");
CREATE INDEX "tabela_encargos_autorId_idx" ON "tabela_encargos"("autorId");
ALTER TABLE "tabela_encargos" ADD CONSTRAINT "tabela_encargos_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "tabela_encargos" ("id", "contratacao", "vigenciaEm", "parametros", "observacao") VALUES
  ('te_clt_202610', 'clt', '2026-10-01',
   '{"tipo":"clt","fgtsBp":800,"multaFgtsBp":4000,"inssEmpresaBp":0,"reservaDecimoTerceiro":true,"reservaFerias":true,"reservaAvisoPrevio":true,"beneficios":[{"nome":"Vale-transporte","valorCent":20000,"suspensoNasFerias":true},{"nome":"Vale-refeição","valorCent":55000,"suspensoNasFerias":true}]}',
   'Versão inicial — decisões de 10/10/2026'),
  ('te_estagio_202610', 'estagio', '2026-10-01',
   '{"tipo":"estagio","reservaRecesso":true,"taxaAgenteCent":8500}',
   'Versão inicial — decisões de 10/10/2026'),
  ('te_prolabore_202610', 'pro_labore', '2026-10-01',
   '{"tipo":"pro_labore","inssEmpresaBp":0}',
   'Versão inicial — decisões de 10/10/2026');

-- Agente de integração do estágio: hoje todos os estagiários ativos são pelo IEL.
ALTER TABLE "vinculo" ADD COLUMN "agenteIntegracao" TEXT;
UPDATE "vinculo" SET "agenteIntegracao" = 'IEL' WHERE "contratacao" = 'estagio' AND "dataFim" IS NULL;

-- Corte do cálculo novo (decisão 8).
INSERT INTO "config_sistema" ("chave", "valor", "updatedAt")
VALUES ('rh.rateio.calculoNovoDesde', '"2026-10"'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("chave") DO NOTHING;
```

- [ ] **Step 3: Aplicar no banco do worktree e gerar o client**

```bash
npx prisma validate
npx prisma db execute --file prisma/migrations/20261011120000_rateio_custo_hora_v2/migration.sql
npx prisma migrate resolve --applied 20261011120000_rateio_custo_hora_v2
npx prisma generate
```
Expected: `validate` sem erro; `db execute` "Script executed successfully"; `resolve` marca como aplicada.

- [ ] **Step 4: Conferir o tipo**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
Expected: erros SÓ nos usos de `rateioHora` com `projetoId` agora opcional ou na `@@unique` removida (`src/modules/projetos/queries.ts`, `src/modules/rh/rateio/*`). Esses usos são reescritos na Task 5 — anotar a lista e seguir.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261011120000_rateio_custo_hora_v2/migration.sql
git commit -m "feat(rateio): tabela de encargos versionada, cabeçalho do fechamento e linha não alocado (schema)"
```

---

### Task 4: Custo do mês de cada pessoa a partir do banco

**Files:**
- Create: `src/modules/rh/rateio/custo-hora/dados.ts`
- Create: `scripts/smoke-rateio-custo-hora.ts`
- Modify: `package.json` (script `smoke:rateio-custo-hora`)

**Interfaces:**
- Consumes: `custoDoMes`, `CustoMes` (Task 1); `parametrosEncargosSchema` (Task 1); `anosCompletos`, `baseDoHoleriteCent`, `fracaoForaDeFerias`, `inicioDoTempoDeCasa`, `jornadaReferenciaMinutos`, `tabelaVigente` (Task 2); models da Task 3.
- Produces:
  - `type CustoDaPessoaNoMes = { contratacao: Contratacao | null; custo: CustoMes | null; jornadaReferenciaMin: number; origemBase: "holerite" | "historico" | "vinculo" | null; tabelaPosterior: boolean; semTabela: boolean }`
  - `custosDoMes(ano: number, mes: number, userIds: string[]): Promise<Map<string, CustoDaPessoaNoMes>>`

- [ ] **Step 1: Escrever o carregador**

```ts
// src/modules/rh/rateio/custo-hora/dados.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { ehDiaUtil } from "@/lib/calendario-trabalho";
import { montarCalendario } from "@/modules/planejamento/agenda";
import type { Contratacao } from "@/generated/prisma/enums";
import { custoDoMes, type CustoMes } from "./encargos";
import { parametrosEncargosSchema } from "./parametros";
import {
  anosCompletos, baseDoHoleriteCent, fracaoForaDeFerias, inicioDoTempoDeCasa, jornadaReferenciaMinutos, tabelaVigente,
} from "./distribuicao";

export type CustoDaPessoaNoMes = {
  contratacao: Contratacao | null;
  /** null = PJ/autônomo (só horas), sem base cadastrada ou sem tabela. */
  custo: CustoMes | null;
  jornadaReferenciaMin: number;
  origemBase: "holerite" | "historico" | "vinculo" | null;
  /** A tabela usada começa depois do mês (só ao recalcular mês anterior à primeira tabela). */
  tabelaPosterior: boolean;
  semTabela: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const cent = (v: { toString(): string } | number | null | undefined) => (v == null ? null : Math.round(Number(v) * 100));

function diasDoMes(ano: number, mes: number): string[] {
  const n = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Custo do mês de cada pessoa (decisões 1–7). Base: CLT e estágio pelo holerite da folha mensal do
 * sistema, senão o histórico contratual, senão o vínculo; sócio sempre pelo cadastro (decisão 6).
 */
export async function custosDoMes(ano: number, mes: number, userIds: string[]): Promise<Map<string, CustoDaPessoaNoMes>> {
  const out = new Map<string, CustoDaPessoaNoMes>();
  if (userIds.length === 0) return out;
  const iniMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 0));
  const primeiroDia = iso(iniMes);
  const ultimoDia = iso(fimMes);

  const [usuarios, vinculos, folha, historicos, tabelas, ferias, calendario] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, contratacao: true } }),
    prisma.vinculo.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, contratacao: true, dataInicio: true, dataFim: true, cargaSemanal: true, remuneracao: true, agenteIntegracao: true },
    }),
    prisma.folhaPagamento.findUnique({
      where: { ano_mes_tipo: { ano, mes, tipo: "mensal" } },
      select: { holerites: { where: { userId: { in: userIds } }, select: { userId: true, itens: { select: { tipo: true, valor: true, descricao: true } } } } },
    }),
    prisma.historicoContratual.findMany({
      where: { userId: { in: userIds }, vigenciaEm: { lte: fimMes }, remuneracao: { not: null } },
      orderBy: { vigenciaEm: "desc" },
      select: { userId: true, remuneracao: true },
    }),
    prisma.tabelaEncargos.findMany({ select: { contratacao: true, vigenciaEm: true, parametros: true } }),
    prisma.ferias.findMany({
      where: { userId: { in: userIds }, status: "aprovado", inicio: { lte: fimMes }, fim: { gte: iniMes } },
      select: { userId: true, inicio: true, fim: true },
    }),
    montarCalendario([ano]),
  ]);

  const diasUteis = diasDoMes(ano, mes).filter((d) => ehDiaUtil(d, calendario));
  const holeritePorUser = new Map((folha?.holerites ?? []).map((h) => [h.userId, h.itens]));
  const historicoPorUser = new Map<string, number>();
  for (const h of historicos) if (!historicoPorUser.has(h.userId)) historicoPorUser.set(h.userId, cent(h.remuneracao)!);
  const contratacaoUser = new Map(usuarios.map((u) => [u.id, u.contratacao]));

  for (const userId of userIds) {
    const doUser = vinculos
      .filter((v) => v.userId === userId)
      .map((v) => ({ ...v, ini: iso(v.dataInicio), fim: v.dataFim ? iso(v.dataFim) : null }));
    const vigente = doUser
      .filter((v) => v.ini <= ultimoDia && (v.fim === null || v.fim >= primeiroDia))
      .sort((a, b) => b.ini.localeCompare(a.ini))[0];
    const contratacao = (vigente?.contratacao ?? contratacaoUser.get(userId) ?? null) as Contratacao | null;
    const jornadaReferenciaMin = jornadaReferenciaMinutos(vigente?.cargaSemanal != null ? Number(vigente.cargaSemanal) : null, diasUteis.length);
    const base: CustoDaPessoaNoMes = { contratacao, custo: null, jornadaReferenciaMin, origemBase: null, tabelaPosterior: false, semTabela: false };

    if (contratacao !== "clt" && contratacao !== "estagio" && contratacao !== "pro_labore") {
      out.set(userId, base);
      continue;
    }

    const versoes = tabelas
      .filter((t) => t.contratacao === contratacao)
      .map((t) => ({ vigenciaEm: iso(t.vigenciaEm), parametros: t.parametros }));
    const escolhida = tabelaVigente(versoes, primeiroDia);
    const parametros = escolhida ? parametrosEncargosSchema.safeParse(escolhida.versao.parametros) : null;
    if (!escolhida || !parametros?.success) {
      out.set(userId, { ...base, semTabela: true });
      continue;
    }

    const itensHolerite = contratacao === "pro_labore" ? undefined : holeritePorUser.get(userId);
    const doHolerite = itensHolerite
      ? baseDoHoleriteCent(itensHolerite.map((i) => ({ tipo: i.tipo, valorCent: cent(i.valor)!, descricao: i.descricao })))
      : 0;
    let baseCent: number | null = null;
    let origemBase: CustoDaPessoaNoMes["origemBase"] = null;
    if (doHolerite > 0) {
      baseCent = doHolerite;
      origemBase = "holerite";
    } else if (historicoPorUser.has(userId)) {
      baseCent = historicoPorUser.get(userId)!;
      origemBase = "historico";
    } else if (cent(vigente?.remuneracao) != null) {
      baseCent = cent(vigente?.remuneracao)!;
      origemBase = "vinculo";
    }
    if (baseCent == null || baseCent <= 0) {
      out.set(userId, { ...base, tabelaPosterior: escolhida.posterior });
      continue;
    }

    const diasFerias = new Set<string>();
    for (const f of ferias.filter((x) => x.userId === userId)) {
      const a = iso(f.inicio);
      const b = iso(f.fim);
      for (const d of diasUteis) if (d >= a && d <= b) diasFerias.add(d);
    }
    const inicioCasa = inicioDoTempoDeCasa(
      doUser.map((v) => ({ contratacao: v.contratacao as Contratacao, dataInicio: v.ini, dataFim: v.fim })),
      contratacao,
      ultimoDia,
    );

    out.set(userId, {
      ...base,
      origemBase,
      tabelaPosterior: escolhida.posterior,
      custo: custoDoMes({
        baseCent,
        parametros: parametros.data,
        anosCompletos: inicioCasa ? anosCompletos(inicioCasa, ultimoDia) : 0,
        fracaoForaDeFerias: fracaoForaDeFerias(diasUteis.length, diasFerias.size),
        viaAgenteIntegracao: !!vigente?.agenteIntegracao,
      }),
    });
  }
  return out;
}
```

- [ ] **Step 2: Escrever o smoke (só leitura)**

```ts
// scripts/smoke-rateio-custo-hora.ts
/**
 * Smoke do custo da hora (R1 do rateio). SÓ LEITURA: calcula o custo de outubro/2026 de todo
 * mundo com vínculo CLT/estágio/sócio e confere as regras contra o próprio banco.
 *
 *   npm run smoke:rateio-custo-hora
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { custosDoMes } from "@/modules/rh/rateio/custo-hora/dados";
import { calcularRateioDoMes } from "@/modules/rh/rateio/queries";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

async function main() {
  const ano = 2026;
  const mes = 10;
  const tabelas = await prisma.tabelaEncargos.count();
  ok(tabelas >= 3, `${tabelas} versão(ões) de tabela de encargos`);

  const vinculos = await prisma.vinculo.findMany({
    where: { contratacao: { in: ["clt", "estagio", "pro_labore", "pj"] }, dataFim: null },
    select: { userId: true, contratacao: true },
  });
  const custos = await custosDoMes(ano, mes, vinculos.map((v) => v.userId));
  for (const v of vinculos) {
    const c = custos.get(v.userId)!;
    if (v.contratacao === "pj") ok(c.custo === null, `PJ ${v.userId} entra só com horas`);
    else if (c.custo) ok(c.custo.totalCent >= c.custo.baseCent, `${v.contratacao} ${v.userId}: total ${c.custo.totalCent} ≥ base ${c.custo.baseCent} (${c.origemBase})`);
    else console.log(`· ${v.contratacao} ${v.userId} sem base cadastrada`);
  }

  const { calculo, linhas } = await calcularRateioDoMes(ano, mes);
  ok(calculo === "v2", `outubro/2026 usa o cálculo novo (${calculo})`);
  for (const [userId, c] of custos) {
    if (!c.custo || c.contratacao === "pro_labore") continue;
    const soma = linhas.filter((l) => l.userId === userId).reduce((s, l) => s + l.custoCent, 0);
    ok(soma === c.custo.totalCent, `${userId}: linhas somam o custo do mês (${soma} = ${c.custo.totalCent})`);
  }
  const { calculo: setembro } = await calcularRateioDoMes(2026, 9);
  ok(setembro === "legado", "setembro/2026 segue no cálculo antigo");

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Em `package.json`, junto dos outros `smoke:*`:

```json
    "smoke:rateio-custo-hora": "tsx --tsconfig tsconfig.server.json scripts/smoke-rateio-custo-hora.ts",
```

- [ ] **Step 3: Commit (o smoke roda depois da Task 5, que cria `calcularRateioDoMes`)**

```bash
git add src/modules/rh/rateio/custo-hora/dados.ts scripts/smoke-rateio-custo-hora.ts package.json
git commit -m "feat(rateio): carrega o custo do mês de cada pessoa (holerite, histórico, férias, tabela)"
```

---

### Task 5: Rateio do mês no cálculo novo, fechamento e leitores

**Files:**
- Modify: `src/modules/rh/rateio/queries.ts`
- Modify: `src/modules/rh/rateio/actions.ts`
- Modify: `src/modules/projetos/queries.ts:495-615` (`margemProjeto`)
- Modify: `src/lib/jobs-handlers.ts:249-275` (`alertaRateioAberto`)
- Modify: `src/components/ponto/ponto-view.tsx:105-115,398-460` (tipo `Rateio` e card)

**Interfaces:**
- Consumes: `custosDoMes` (Task 4); `calculoDoMes`, `divisorMinutos`, `limitesDoMesSP`, `minutosNoIntervalo`, `naturezaDaSessao`, `ratearCusto`, `type NaturezaLinha` (Task 2).
- Produces:
  - `type LinhaRateio = { userId: string; projetoId: string | null; natureza: NaturezaLinha; contratacao: Contratacao | null; minutos: number; custoCent: number }`
  - `corteCalculoNovo(): Promise<string>`
  - `calcularRateioV2(ano: number, mes: number, agora?: Date): Promise<LinhaRateio[]>`
  - `calcularRateioDoMes(ano: number, mes: number): Promise<{ calculo: "legado" | "v2"; linhas: LinhaRateio[] }>`
  - `rateioMesGestor` passa a devolver também `custoNaoAlocado: number` (reais).

- [ ] **Step 1: Reescrever `queries.ts`**

Renomear `calcularRateioDetalhado` para `calcularRateioLegado` (mesmo corpo, marcado como cálculo antigo) e acrescentar, abaixo dele:

```ts
import type { Contratacao } from "@/generated/prisma/enums";
import { custosDoMes } from "@/modules/rh/rateio/custo-hora/dados";
import {
  calculoDoMes, divisorMinutos, limitesDoMesSP, minutosNoIntervalo, naturezaDaSessao, ratearCusto, type NaturezaLinha,
} from "@/modules/rh/rateio/custo-hora/distribuicao";

export type LinhaRateio = {
  userId: string;
  projetoId: string | null;
  natureza: NaturezaLinha;
  contratacao: Contratacao | null;
  minutos: number;
  custoCent: number;
};

const CHAVE_CORTE = "rh.rateio.calculoNovoDesde";

/** Mês (AAAA-MM) a partir do qual vale o cálculo com encargos (decisão 8). */
export async function corteCalculoNovo(): Promise<string> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CORTE } });
  return typeof c?.valor === "string" && /^\d{4}-\d{2}$/.test(c.valor) ? c.valor : "2026-10";
}

/**
 * Cálculo novo (decisões 1, 6, 9, 15): custo do mês com encargos ÷ horas marcadas (sócio: jornada
 * de referência), sessões recortadas no mês, linha "não alocado" com o resto. Entra também quem
 * tem custo no mês sem sessão nenhuma — o custo vai inteiro para "não alocado".
 */
export async function calcularRateioV2(ano: number, mes: number, agora: Date = new Date()): Promise<LinhaRateio[]> {
  const { inicio, fim } = limitesDoMesSP(ano, mes);
  const iniMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 0));
  const [sessoes, comCusto] = await Promise.all([
    prisma.sessaoTrabalho.findMany({
      where: { inicio: { lt: fim }, OR: [{ fim: null }, { fim: { gt: inicio } }] },
      select: { userId: true, projetoId: true, tipoAlocacao: true, inicio: true, fim: true },
    }),
    prisma.vinculo.findMany({
      where: {
        contratacao: { in: ["clt", "estagio", "pro_labore"] },
        dataInicio: { lte: fimMes },
        OR: [{ dataFim: null }, { dataFim: { gte: iniMes } }],
      },
      select: { userId: true },
    }),
  ]);
  const userIds = [...new Set([...sessoes.map((s) => s.userId), ...comCusto.map((v) => v.userId)])];
  const custos = await custosDoMes(ano, mes, userIds);

  type Linha = { projetoId: string | null; natureza: NaturezaLinha; minutos: number };
  const porUser = new Map<string, { linhas: Map<string, Linha>; total: number }>();
  for (const s of sessoes) {
    const minutos = minutosNoIntervalo(s.inicio, s.fim, inicio, fim, agora);
    if (minutos === 0) continue;
    const natureza = naturezaDaSessao(s.projetoId, s.tipoAlocacao);
    const projetoId = natureza === "nao_alocado" ? null : s.projetoId;
    const chave = `${natureza}|${projetoId ?? ""}`;
    const acc = porUser.get(s.userId) ?? { linhas: new Map<string, Linha>(), total: 0 };
    const l = acc.linhas.get(chave) ?? { projetoId, natureza, minutos: 0 };
    l.minutos += minutos;
    acc.linhas.set(chave, l);
    acc.total += minutos;
    porUser.set(s.userId, acc);
  }

  const out: LinhaRateio[] = [];
  for (const userId of userIds) {
    const acc = porUser.get(userId) ?? { linhas: new Map<string, Linha>(), total: 0 };
    const c = custos.get(userId);
    const contratacao = c?.contratacao ?? null;
    const totalCent = c?.custo?.totalCent ?? 0;
    const divisor = divisorMinutos({ contratacao, minutosMarcados: acc.total, jornadaReferenciaMin: c?.jornadaReferenciaMin ?? 0 });
    const { porLinha, naoApontadoCent } = ratearCusto(totalCent, divisor, [...acc.linhas].map(([chave, l]) => ({ chave, minutos: l.minutos })));
    const naoAlocado = { minutos: 0, custoCent: naoApontadoCent };
    for (const [chave, l] of acc.linhas) {
      const custoCent = porLinha.get(chave) ?? 0;
      if (l.natureza === "nao_alocado") {
        naoAlocado.minutos += l.minutos;
        naoAlocado.custoCent += custoCent;
      } else {
        out.push({ userId, projetoId: l.projetoId, natureza: l.natureza, contratacao, minutos: l.minutos, custoCent });
      }
    }
    if (naoAlocado.minutos > 0 || naoAlocado.custoCent > 0) {
      out.push({ userId, projetoId: null, natureza: "nao_alocado", contratacao, minutos: naoAlocado.minutos, custoCent: naoAlocado.custoCent });
    }
  }
  return out;
}

/** Rateio do mês no cálculo que vale para ele: antigo antes do corte, novo a partir dele. */
export async function calcularRateioDoMes(ano: number, mes: number): Promise<{ calculo: "legado" | "v2"; linhas: LinhaRateio[] }> {
  const calculo = calculoDoMes(ano, mes, await corteCalculoNovo());
  if (calculo === "v2") return { calculo, linhas: await calcularRateioV2(ano, mes) };
  const rows = await calcularRateioLegado(ano, mes);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, contratacao: true },
  });
  const contr = new Map(users.map((u) => [u.id, u.contratacao]));
  return {
    calculo,
    linhas: rows.map((r) => ({
      userId: r.userId,
      projetoId: r.projetoId,
      natureza: "projeto" as const,
      contratacao: contr.get(r.userId) ?? null,
      minutos: r.minutos,
      custoCent: Math.round(r.custo * 100),
    })),
  };
}
```

Reescrever `rateioMesGestor` para usar o cálculo do mês e o cabeçalho:

```ts
/** Rateio do mês agregado por projeto, para o painel do gestor. */
export async function rateioMesGestor(ano: number, mes: number) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const [{ linhas }, fechamento, sessoesSemProjeto] = await Promise.all([
    calcularRateioDoMes(ano, mes),
    prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { fechadoEm: true } }),
    prisma.sessaoTrabalho.findMany({
      where: { inicio: { gte: ini, lt: fim }, projetoId: null },
      select: { inicio: true, fim: true, tipoAlocacao: true },
    }),
  ]);

  const doProjeto = linhas.filter((l) => l.projetoId);
  const projIds = [...new Set(doProjeto.map((r) => r.projetoId!))];
  const projetos = await prisma.projeto.findMany({ where: { id: { in: projIds } }, select: { id: true, codigo: true, nome: true } });
  const pinfo = new Map(projetos.map((p) => [p.id, p]));

  const agg = new Map<string, { projeto: string; minutos: number; centavos: number }>();
  for (const r of doProjeto) {
    const p = pinfo.get(r.projetoId!);
    const label = p ? `${formatarCodigo(p.codigo)} · ${p.nome}` : r.projetoId!;
    const cur = agg.get(r.projetoId!) ?? { projeto: label, minutos: 0, centavos: 0 };
    cur.minutos += r.minutos;
    cur.centavos += r.custoCent;
    agg.set(r.projetoId!, cur);
  }
  const custoNaoAlocadoCent = linhas.filter((l) => l.natureza === "nao_alocado").reduce((s, l) => s + l.custoCent, 0);
  const custoTotalCent = linhas.reduce((s, l) => s + l.custoCent, 0);

  const alocacoesSemProjeto = { semProjeto: 0, reuniaoInterna: 0, reuniaoExterna: 0 };
  for (const s of sessoesSemProjeto) {
    const minutos = minutosSessao(s.inicio, s.fim);
    if (s.tipoAlocacao === "reuniao_interna") alocacoesSemProjeto.reuniaoInterna += minutos;
    else if (s.tipoAlocacao === "reuniao_externa") alocacoesSemProjeto.reuniaoExterna += minutos;
    else alocacoesSemProjeto.semProjeto += minutos;
  }

  return {
    porProjeto: [...agg.values()]
      .map((a) => ({ projeto: a.projeto, minutos: a.minutos, custo: a.centavos / 100 }))
      .sort((a, b) => b.minutos - a.minutos),
    ...alocacoesSemProjeto,
    custoNaoAlocado: custoNaoAlocadoCent / 100,
    custoTotal: custoTotalCent / 100,
    fechado: fechamento != null,
    fechadoEm: fechamento?.fechadoEm ?? null,
  };
}
```

- [ ] **Step 2: Reescrever o fechamento (`actions.ts`)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

import { calcularRateioDoMes } from "@/modules/rh/rateio/queries";

/**
 * Fecha o rateio do mês: grava o cabeçalho (`FechamentoRateio`, com o cálculo usado) e o snapshot
 * das linhas, inclusive "não alocado". Refechar substitui o anterior — a trava e a reabertura com
 * motivo são a R3 do roteiro.
 */
export const fecharRateioMes = defineAction(
  {
    modulo: "rh",
    acao: "fechar-rateio",
    gereRh: true,
    entidade: "RateioHora",
    schema: z.object({
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
    }),
  },
  async ({ ano, mes }, { user }) => {
    const { calculo, linhas } = await calcularRateioDoMes(ano, mes);
    const result = await prisma.$transaction(async (tx) => {
      await tx.rateioHora.deleteMany({ where: { ano, mes } });
      await tx.fechamentoRateio.upsert({
        where: { ano_mes: { ano, mes } },
        create: { ano, mes, calculo, fechadoPorId: user.id },
        update: { calculo, fechadoEm: new Date(), fechadoPorId: user.id },
      });
      if (linhas.length === 0) return 0;
      await tx.rateioHora.createMany({
        data: linhas.map((l) => ({
          userId: l.userId,
          projetoId: l.projetoId,
          natureza: l.natureza,
          contratacao: l.contratacao,
          ano,
          mes,
          minutos: l.minutos,
          custoHora: l.minutos > 0 ? Math.round((l.custoCent * 60) / l.minutos) / 100 : 0,
          custo: l.custoCent / 100,
        })),
      });
      return linhas.length;
    });
    revalidatePath("/ponto");
    return { linhas: result, calculo };
  },
);
```

- [ ] **Step 3: Ajustar a margem do projeto (`src/modules/projetos/queries.ts`)**

Trocar o import `calcularRateioDetalhado` por `calcularRateioDoMes`. No `Promise.all` de `margemProjeto`, o select do rateio passa a ser:

```ts
    prisma.rateioHora.findMany({
      where: { projetoId },
      select: { custo: true, contratacao: true, user: { select: { contratacao: true } } },
    }),
```

e a separação usa a foto do mês:

```ts
  const rateioHoras = separarRateioPorVinculo(
    rateios.map((rateio) => ({ custo: Number(rateio.custo), contratacao: rateio.contratacao ?? rateio.user.contratacao })),
  );
```

O bloco do mês corrente vira:

```ts
  const mesFechado = await prisma.fechamentoRateio.findUnique({
    where: { ano_mes: { ano: anoAtual, mes: mesAtual } },
    select: { id: true },
  });
  let custoHorasMesCorrente = 0;
  if (!mesFechado) {
    const { linhas } = await calcularRateioDoMes(anoAtual, mesAtual);
    custoHorasMesCorrente = linhas.filter((r) => r.projetoId === projetoId).reduce((s, r) => s + r.custoCent, 0) / 100;
  }
```

- [ ] **Step 4: Ajustar o alerta (`src/lib/jobs-handlers.ts`)**

Em `alertaRateioAberto`, trocar a checagem de fechado por:

```ts
  const fechado = await prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { id: true } });
```

- [ ] **Step 5: Mostrar "não alocado" no card do ponto (`ponto-view.tsx`)**

No tipo `Rateio` (perto da linha 108), acrescentar `custoNaoAlocado: number;`. No card, depois do `<li>` de "Reunião externa", acrescentar:

```tsx
                {rateio.custoNaoAlocado > 0 && (
                  <li className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">Não alocado (custo fora dos projetos)</span>
                    <span className="font-mono text-muted-foreground">—</span>
                    <span className="w-28 text-right font-mono">{brl(rateio.custoNaoAlocado)}</span>
                  </li>
                )}
```

e trocar a condição do botão para `disabled={busy || (rateio.porProjeto.length === 0 && rateio.custoNaoAlocado === 0)}`.

- [ ] **Step 6: Rodar os testes, o tipo e o smoke**

```bash
npx vitest run src/modules/rh src/modules/projetos
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
npm run smoke:rateio-custo-hora
```
Expected: testes PASS; `tsc` sem erro; smoke "Tudo certo." (pessoa sem base aparece com `·`, não como falha).

- [ ] **Step 7: Commit**

```bash
git add src/modules/rh/rateio/queries.ts src/modules/rh/rateio/actions.ts src/modules/projetos/queries.ts src/lib/jobs-handlers.ts src/components/ponto/ponto-view.tsx
git commit -m "feat(rateio): cálculo novo a partir de outubro, linha não alocado e cabeçalho do fechamento"
```

---

### Task 6: Tela de tabelas de encargos e agente de integração

**Files:**
- Create: `src/modules/rh/encargos/regras.ts`
- Test: `src/modules/rh/encargos/regras.test.ts`
- Create: `src/modules/rh/encargos/queries.ts`
- Create: `src/modules/rh/encargos/actions.ts`
- Create: `src/app/(dashboard)/rh/encargos/page.tsx`
- Create: `src/components/rh/encargos/encargos-view.tsx`
- Create: `src/components/rh/encargos/nova-versao-encargos-dialog.tsx`
- Modify: `src/lib/nav-config.ts` (item "Encargos" no grupo do RH, depois de "Folha CLT")

**Interfaces:**
- Consumes: `parametrosEncargosSchema`, `resumoParametros`, `CONTRATACOES_COM_ENCARGOS`, `type ParametrosEncargos` (Task 1).
- Produces:
  - `motivoParaNaoExcluirVersao(p: { vigencia: string; vigenciasDaContratacao: string[]; mesesFechadosV2: string[] }): string | null` (datas `AAAA-MM`)
  - `listarTabelasEncargos(): Promise<{ id: string; contratacao: ContratacaoComEncargos; vigencia: string; resumo: string; observacao: string | null; parametros: ParametrosEncargos }[]>`
  - `listarEstagiariosAtivos(): Promise<{ vinculoId: string; nome: string; agenteIntegracao: string | null }[]>`
  - actions `criarVersaoEncargos({ contratacao, vigencia: "AAAA-MM", parametros, observacao? })`, `excluirVersaoEncargos({ id })`, `definirAgenteIntegracao({ vinculoId, agente: string | null })`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/rh/encargos/regras.test.ts
import { describe, expect, it } from "vitest";
import { motivoParaNaoExcluirVersao } from "./regras";

describe("motivoParaNaoExcluirVersao", () => {
  it("não deixa a contratação sem tabela", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2026-10", vigenciasDaContratacao: ["2026-10"], mesesFechadosV2: [] }))
      .toBe("É a única versão desta contratação. Crie outra antes de excluir esta.");
  });
  it("não exclui versão usada por mês fechado", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2026-10", vigenciasDaContratacao: ["2026-10", "2027-01"], mesesFechadosV2: ["2026-11"] }))
      .toBe("Esta versão foi usada no fechamento de 11/2026. Para mudar valores, crie uma versão nova.");
  });
  it("mês fechado depois da versão seguinte não prende a anterior", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2026-10", vigenciasDaContratacao: ["2026-10", "2027-01"], mesesFechadosV2: ["2027-02"] }))
      .toBeNull();
  });
  it("versão futura sem uso pode sair", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2027-01", vigenciasDaContratacao: ["2026-10", "2027-01"], mesesFechadosV2: ["2026-11"] }))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/rh/encargos/regras.test.ts`
Expected: FAIL — `Failed to resolve import "./regras"`.

- [ ] **Step 3: Write the rule**

```ts
// src/modules/rh/encargos/regras.ts
/** Regras da tabela de encargos versionada (decisão 2). PURO; datas em `AAAA-MM`. */

const mesTexto = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/**
 * Uma versão só sai se a contratação continua com tabela e se nenhum mês fechado no cálculo novo a
 * usou (meses de `vigencia` até antes da versão seguinte). Mudar valores = versão nova.
 */
export function motivoParaNaoExcluirVersao(p: { vigencia: string; vigenciasDaContratacao: string[]; mesesFechadosV2: string[] }): string | null {
  if (p.vigenciasDaContratacao.length <= 1) return "É a única versão desta contratação. Crie outra antes de excluir esta.";
  const seguinte = [...p.vigenciasDaContratacao].sort().find((v) => v > p.vigencia) ?? "9999-12";
  const usado = [...p.mesesFechadosV2].sort().find((m) => m >= p.vigencia && m < seguinte);
  if (usado) return `Esta versão foi usada no fechamento de ${mesTexto(usado)}. Para mudar valores, crie uma versão nova.`;
  return null;
}
```

Run: `npx vitest run src/modules/rh/encargos/regras.test.ts` — Expected: PASS.

- [ ] **Step 4: Queries e actions**

```ts
// src/modules/rh/encargos/queries.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CONTRATACOES_COM_ENCARGOS, parametrosEncargosSchema, resumoParametros,
  type ContratacaoComEncargos, type ParametrosEncargos,
} from "@/modules/rh/rateio/custo-hora/parametros";

export async function listarTabelasEncargos() {
  const rows = await prisma.tabelaEncargos.findMany({ orderBy: [{ contratacao: "asc" }, { vigenciaEm: "desc" }] });
  return rows.flatMap((r) => {
    const p = parametrosEncargosSchema.safeParse(r.parametros);
    if (!p.success || !(CONTRATACOES_COM_ENCARGOS as readonly string[]).includes(r.contratacao)) return [];
    return [{
      id: r.id,
      contratacao: r.contratacao as ContratacaoComEncargos,
      vigencia: r.vigenciaEm.toISOString().slice(0, 7),
      resumo: resumoParametros(p.data),
      observacao: r.observacao,
      parametros: p.data as ParametrosEncargos,
    }];
  });
}

/** Estagiários com vínculo ativo, para marcar quem é pelo agente de integração. */
export async function listarEstagiariosAtivos() {
  const vs = await prisma.vinculo.findMany({
    where: { contratacao: "estagio", dataFim: null },
    select: { id: true, agenteIntegracao: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return vs.map((v) => ({ vinculoId: v.id, nome: v.user.name, agenteIntegracao: v.agenteIntegracao }));
}
```

```ts
// src/modules/rh/encargos/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { parametrosEncargosSchema } from "@/modules/rh/rateio/custo-hora/parametros";
import { motivoParaNaoExcluirVersao } from "@/modules/rh/encargos/regras";

const PATH = "/rh/encargos";
const mesIso = (d: Date) => d.toISOString().slice(0, 7);

export const criarVersaoEncargos = defineAction(
  {
    modulo: "rh",
    acao: "criar-versao-encargos",
    gereRh: true,
    entidade: "TabelaEncargos",
    schema: z.object({
      contratacao: z.enum(["clt", "estagio", "pro_labore"]),
      vigencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês de início."),
      parametros: parametrosEncargosSchema,
      observacao: z.string().trim().max(500).optional(),
    }),
  },
  async (i, { user }) => {
    if (i.parametros.tipo !== i.contratacao) throw new ActionError("Os parâmetros não são desta contratação.");
    const vigenciaEm = new Date(`${i.vigencia}-01T00:00:00Z`);
    const existe = await prisma.tabelaEncargos.findUnique({ where: { contratacao_vigenciaEm: { contratacao: i.contratacao, vigenciaEm } } });
    if (existe) throw new ActionError("Já existe uma versão começando neste mês. Exclua a anterior ou escolha outro mês.");
    const fechado = await prisma.fechamentoRateio.findFirst({
      where: { calculo: "v2", OR: [{ ano: { gt: vigenciaEm.getUTCFullYear() } }, { ano: vigenciaEm.getUTCFullYear(), mes: { gte: vigenciaEm.getUTCMonth() + 1 } }] },
      select: { ano: true, mes: true },
    });
    if (fechado) {
      throw new ActionError(`O mês ${String(fechado.mes).padStart(2, "0")}/${fechado.ano} já foi fechado. A versão nova precisa começar depois do último mês fechado.`);
    }
    const criada = await prisma.tabelaEncargos.create({
      data: { contratacao: i.contratacao, vigenciaEm, parametros: i.parametros, observacao: i.observacao || null, autorId: user.id },
    });
    revalidatePath(PATH);
    return { id: criada.id };
  },
);

export const excluirVersaoEncargos = defineAction(
  {
    modulo: "rh",
    acao: "excluir-versao-encargos",
    gereRh: true,
    entidade: "TabelaEncargos",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: async (i) => prisma.tabelaEncargos.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const v = await prisma.tabelaEncargos.findUnique({ where: { id: i.id } });
    if (!v) throw new ActionError("Versão não encontrada.");
    const [irmas, fechados] = await Promise.all([
      prisma.tabelaEncargos.findMany({ where: { contratacao: v.contratacao }, select: { vigenciaEm: true } }),
      prisma.fechamentoRateio.findMany({ where: { calculo: "v2" }, select: { ano: true, mes: true } }),
    ]);
    const motivo = motivoParaNaoExcluirVersao({
      vigencia: mesIso(v.vigenciaEm),
      vigenciasDaContratacao: irmas.map((x) => mesIso(x.vigenciaEm)),
      mesesFechadosV2: fechados.map((f) => `${f.ano}-${String(f.mes).padStart(2, "0")}`),
    });
    if (motivo) throw new ActionError(motivo);
    await prisma.tabelaEncargos.delete({ where: { id: i.id } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);

export const definirAgenteIntegracao = defineAction(
  {
    modulo: "rh",
    acao: "definir-agente-integracao",
    gereRh: true,
    entidade: "Vinculo",
    schema: z.object({ vinculoId: z.string().min(1), agente: z.string().trim().max(60).nullable() }),
    entidadeId: (_d, i) => i.vinculoId,
    capturarAntes: async (i) => prisma.vinculo.findUnique({ where: { id: i.vinculoId }, select: { agenteIntegracao: true } }),
  },
  async (i) => {
    const r = await prisma.vinculo.updateMany({
      where: { id: i.vinculoId, contratacao: "estagio", dataFim: null },
      data: { agenteIntegracao: i.agente || null },
    });
    if (r.count !== 1) throw new ActionError("Só dá para mudar o agente de um estágio ativo.");
    revalidatePath(PATH);
    return { ok: true };
  },
);
```

- [ ] **Step 5: Página, tela e diálogo**

```tsx
// src/app/(dashboard)/rh/encargos/page.tsx
import type { Metadata } from "next";
import { requireGestorRh } from "@/lib/session";
import { listarEstagiariosAtivos, listarTabelasEncargos } from "@/modules/rh/encargos/queries";
import { EncargosView } from "@/components/rh/encargos/encargos-view";

export const metadata: Metadata = { title: "Encargos" };

export default async function EncargosPage() {
  await requireGestorRh();
  const [versoes, estagiarios] = await Promise.all([listarTabelasEncargos(), listarEstagiariosAtivos()]);
  return <EncargosView versoes={versoes} estagiarios={estagiarios} />;
}
```

```tsx
// src/components/rh/encargos/encargos-view.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { excluirVersaoEncargos, definirAgenteIntegracao } from "@/modules/rh/encargos/actions";
import type { ContratacaoComEncargos, ParametrosEncargos } from "@/modules/rh/rateio/custo-hora/parametros";
import { NovaVersaoEncargosDialog } from "./nova-versao-encargos-dialog";

type Versao = { id: string; contratacao: ContratacaoComEncargos; vigencia: string; resumo: string; observacao: string | null; parametros: ParametrosEncargos };
type Estagiario = { vinculoId: string; nome: string; agenteIntegracao: string | null };

const TITULO: Record<ContratacaoComEncargos, string> = { clt: "CLT", estagio: "Estágio", pro_labore: "Pró-labore (sócios)" };
const mesTexto = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const selectCls = "h-9 rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EncargosView({ versoes, estagiarios }: { versoes: Versao[]; estagiarios: Estagiario[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nova, setNova] = useState<ContratacaoComEncargos | null>(null);

  async function excluir(v: Versao) {
    const okConfirm = await confirm({
      title: "Excluir versão?",
      description: `A versão de ${TITULO[v.contratacao]} que começa em ${mesTexto(v.vigencia)} será excluída.`,
      confirmText: "Excluir",
      destructive: true,
    });
    if (!okConfirm) return;
    start(async () => {
      const r = await excluirVersaoEncargos({ id: v.id });
      if (!r.ok) toast.error(r.error);
      else { toast.success("Versão excluída."); router.refresh(); }
    });
  }

  function mudarAgente(e: Estagiario, valor: string) {
    start(async () => {
      const r = await definirAgenteIntegracao({ vinculoId: e.vinculoId, agente: valor === "" ? null : valor });
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Encargos" descricao="Quanto cada contratação custa além do salário, por mês de vigência." />
      <div className="grid gap-4 lg:grid-cols-3">
        {(["clt", "estagio", "pro_labore"] as const).map((c) => {
          const lista = versoes.filter((v) => v.contratacao === c);
          return (
            <Card key={c}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{TITULO[c]}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setNova(c)} disabled={pending}>
                    <Plus className="size-4" /> Nova versão
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lista.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem tabela: o custo desta contratação fica sem encargos.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {lista.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">Desde {mesTexto(v.vigencia)}</p>
                          <p className="text-muted-foreground">{v.resumo}</p>
                          {v.observacao && <p className="text-xs text-muted-foreground">{v.observacao}</p>}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => excluir(v)} disabled={pending}>Excluir</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estagiários e agente de integração</CardTitle>
          <CardDescription>A taxa do agente só entra no custo de quem foi contratado por ele.</CardDescription>
        </CardHeader>
        <CardContent>
          {estagiarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum estágio ativo.</p>
          ) : (
            <ul className="divide-y text-sm">
              {estagiarios.map((e) => (
                <li key={e.vinculoId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                  <select
                    aria-label={`Contratação de ${e.nome}`}
                    className={selectCls}
                    value={e.agenteIntegracao ?? ""}
                    onChange={(ev) => mudarAgente(e, ev.target.value)}
                    disabled={pending}
                  >
                    <option value="IEL">Pelo IEL</option>
                    <option value="">Contratação direta</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {nova && (
        <NovaVersaoEncargosDialog
          contratacao={nova}
          base={versoes.find((v) => v.contratacao === nova)?.parametros ?? null}
          onOpenChange={(open) => !open && setNova(null)}
        />
      )}
    </div>
  );
}
```

Antes de usar `useConfirm`, abrir `src/components/ui/confirm-dialog.tsx` e conferir os nomes das opções (`title`/`description`/`confirmText`/`destructive`); ajustar se forem outros. O `confirm` vem **antes** do `start(...)` (regra do CLAUDE.md).

```tsx
// src/components/rh/encargos/nova-versao-encargos-dialog.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarVersaoEncargos } from "@/modules/rh/encargos/actions";
import type { ContratacaoComEncargos, ParametrosEncargos } from "@/modules/rh/rateio/custo-hora/parametros";

const PADRAO: Record<ContratacaoComEncargos, ParametrosEncargos> = {
  clt: { tipo: "clt", fgtsBp: 800, multaFgtsBp: 4000, inssEmpresaBp: 0, reservaDecimoTerceiro: true, reservaFerias: true, reservaAvisoPrevio: true, beneficios: [] },
  estagio: { tipo: "estagio", reservaRecesso: true, taxaAgenteCent: 0 },
  pro_labore: { tipo: "pro_labore", inssEmpresaBp: 0 },
};

/** "8" → 800 bp; "R$ 200,00" digitado como "200,00" → 20000 centavos. */
const paraBp = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);
const paraCent = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);
const deBp = (n: number) => String(n / 100).replace(".", ",");
const deCent = (n: number) => (n / 100).toFixed(2).replace(".", ",");

function proximoMes() {
  const d = new Date();
  const m = d.getMonth() + 2;
  return m > 12 ? `${d.getFullYear() + 1}-01` : `${d.getFullYear()}-${String(m).padStart(2, "0")}`;
}

export function NovaVersaoEncargosDialog({
  contratacao,
  base,
  onOpenChange,
}: {
  contratacao: ContratacaoComEncargos;
  /** Versão mais recente, para começar dela. */
  base: ParametrosEncargos | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const p0 = base ?? PADRAO[contratacao];
  const [vigencia, setVigencia] = useState(proximoMes());
  const [observacao, setObservacao] = useState("");
  const [f, setF] = useState(() => ({
    fgts: p0.tipo === "clt" ? deBp(p0.fgtsBp) : "8",
    multa: p0.tipo === "clt" ? deBp(p0.multaFgtsBp) : "40",
    inss: p0.tipo === "clt" || p0.tipo === "pro_labore" ? deBp(p0.inssEmpresaBp) : "0",
    decimo: p0.tipo === "clt" ? p0.reservaDecimoTerceiro : true,
    ferias: p0.tipo === "clt" ? p0.reservaFerias : true,
    aviso: p0.tipo === "clt" ? p0.reservaAvisoPrevio : true,
    beneficios: p0.tipo === "clt" ? p0.beneficios.map((b) => ({ nome: b.nome, valor: deCent(b.valorCent), suspenso: b.suspensoNasFerias })) : [],
    recesso: p0.tipo === "estagio" ? p0.reservaRecesso : true,
    taxa: p0.tipo === "estagio" ? deCent(p0.taxaAgenteCent) : "0,00",
  }));

  function montar(): ParametrosEncargos {
    if (contratacao === "clt") {
      return {
        tipo: "clt", fgtsBp: paraBp(f.fgts), multaFgtsBp: paraBp(f.multa), inssEmpresaBp: paraBp(f.inss),
        reservaDecimoTerceiro: f.decimo, reservaFerias: f.ferias, reservaAvisoPrevio: f.aviso,
        beneficios: f.beneficios.map((b) => ({ nome: b.nome, valorCent: paraCent(b.valor), suspensoNasFerias: b.suspenso })),
      };
    }
    if (contratacao === "estagio") return { tipo: "estagio", reservaRecesso: f.recesso, taxaAgenteCent: paraCent(f.taxa) };
    return { tipo: "pro_labore", inssEmpresaBp: paraBp(f.inss) };
  }

  function salvar() {
    setErro("");
    start(async () => {
      const r = await criarVersaoEncargos({ contratacao, vigencia, parametros: montar(), observacao: observacao || undefined });
      if (!r.ok) { setErro(r.error); return; }
      toast.success("Versão criada.");
      onOpenChange(false);
      router.refresh();
    });
  }

  const check = (id: string, label: string, valor: boolean, set: (v: boolean) => void) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={valor} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova versão da tabela</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vigencia">Vale a partir de</Label>
            <Input id="vigencia" type="month" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
          </div>
          {contratacao === "clt" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><Label htmlFor="fgts">FGTS (%)</Label><Input id="fgts" inputMode="decimal" value={f.fgts} onChange={(e) => setF({ ...f, fgts: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="multa">Multa do FGTS (%)</Label><Input id="multa" inputMode="decimal" value={f.multa} onChange={(e) => setF({ ...f, multa: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="inss">INSS da empresa (%)</Label><Input id="inss" inputMode="decimal" value={f.inss} onChange={(e) => setF({ ...f, inss: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">INSS da empresa fica 0 nos Anexos III e V do Simples: ele já vem no DAS.</p>
              {check("decimo", "Reserva de 13º", f.decimo, (v) => setF({ ...f, decimo: v }))}
              {check("ferias", "Reserva de férias + 1/3", f.ferias, (v) => setF({ ...f, ferias: v }))}
              {check("aviso", "Reserva de aviso prévio", f.aviso, (v) => setF({ ...f, aviso: v }))}
              <div className="space-y-2">
                <p className="text-sm font-medium">Benefícios por mês</p>
                {f.beneficios.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor={`b-nome-${i}`}>Nome</Label>
                      <Input id={`b-nome-${i}`} value={b.nome} onChange={(e) => setF({ ...f, beneficios: f.beneficios.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })} />
                    </div>
                    <div className="w-32 space-y-1">
                      <Label htmlFor={`b-valor-${i}`}>Valor (R$)</Label>
                      <Input id={`b-valor-${i}`} inputMode="decimal" value={b.valor} onChange={(e) => setF({ ...f, beneficios: f.beneficios.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })} />
                    </div>
                    {check(`b-susp-${i}`, "Não paga nas férias", b.suspenso, (v) => setF({ ...f, beneficios: f.beneficios.map((x, j) => (j === i ? { ...x, suspenso: v } : x)) }))}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, beneficios: f.beneficios.filter((_, j) => j !== i) })}>Remover</Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, beneficios: [...f.beneficios, { nome: "", valor: "0,00", suspenso: true }] })}>Adicionar benefício</Button>
              </div>
            </>
          )}
          {contratacao === "estagio" && (
            <>
              {check("recesso", "Reserva de recesso (1/12 da bolsa)", f.recesso, (v) => setF({ ...f, recesso: v }))}
              <div className="space-y-1">
                <Label htmlFor="taxa">Taxa mensal do agente de integração (R$)</Label>
                <Input id="taxa" inputMode="decimal" value={f.taxa} onChange={(e) => setF({ ...f, taxa: e.target.value })} />
              </div>
            </>
          )}
          {contratacao === "pro_labore" && (
            <div className="space-y-1">
              <Label htmlFor="inss-pl">INSS da empresa sobre o pró-labore (%)</Label>
              <Input id="inss-pl" inputMode="decimal" value={f.inss} onChange={(e) => setF({ ...f, inss: e.target.value })} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="obs">Observação</Label>
            <Input id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: reajuste do vale-refeição" />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>Criar versão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Em `src/lib/nav-config.ts`, depois do item "Folha CLT", acrescentar (e importar `Percent` de `lucide-react` no topo do arquivo):

```ts
      {
        title: "Encargos",
        href: "/rh/encargos",
        icon: Percent,
        permissao: "rh:folha",
      },
```

- [ ] **Step 6: Conferir lint, tipo e a guarda de campos**

```bash
npx vitest run src/modules/rh/encargos src/lib/campos/guarda-campos.test.ts
npm run lint
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
```
Expected: tudo verde. Os campos novos são percentual e dinheiro (fora do catálogo de `lib/campos`); se a guarda reclamar de algum, acrescentar `campo-ok: percentual/valor da tabela de encargos` na linha.

- [ ] **Step 7: Conferir a tela no navegador**

Com `npm run dev -- -p 3001` no ar (login `claude.admin@dev.senahub` / `ClaudeDev@2026`):
1. `/rh/encargos` mostra as três tabelas com a versão de 10/2026 e o resumo da decisão 4.
2. "Nova versão" de CLT para o mês seguinte com VR R$ 600,00 → aparece no topo da lista de CLT.
3. Excluir a versão de 10/2026 com só ela na lista de estágio → mensagem "É a única versão…".
4. Trocar um estagiário para "Contratação direta" e voltar para "Pelo IEL".
5. A 390×844, `document.documentElement.scrollWidth` = 390; a 1366×768 com o menu aberto, o cabeçalho não encobre a barra.

- [ ] **Step 8: Commit**

```bash
git add src/modules/rh/encargos src/app/\(dashboard\)/rh/encargos src/components/rh/encargos src/lib/nav-config.ts
git commit -m "feat(rh): tela de tabelas de encargos e agente de integração do estágio"
```

---

### Task 7: Documentação e verificação final

**Files:**
- Modify: `docs/manual/rh-ponto/folha-clt.md` (seção "Custo da hora e encargos")
- Modify: `docs/manual/novidades.md`
- Modify: `CLAUDE.md` (parágrafo do rateio, em Architecture)
- Modify: `docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md` (marcar R1 entregue no topo)

- [ ] **Step 1: Manual**

Em `docs/manual/rh-ponto/folha-clt.md`, acrescentar:

```markdown
## Custo da hora e encargos

Desde outubro de 2026, o custo de uma hora de trabalho é o **custo do mês da pessoa dividido pelas horas que ela marcou no ponto**.

- **Custo do mês:** o salário do holerite (ou, sem holerite, o do histórico contratual) mais os encargos da tabela da contratação: FGTS, reservas de 13º, férias e aviso prévio, multa do FGTS e os benefícios (vale-transporte e vale-refeição).
- **Estagiário:** bolsa, reserva do recesso e a taxa do IEL (só de quem foi contratado pelo IEL).
- **Sócio:** o pró-labore dividido pela jornada de referência. O que ele não apontar em projeto fica em "não alocado".
- **PJ e freelancer:** entram só com horas; o custo vem da Produção.

As tabelas ficam em **RH → Encargos**. Cada mudança é uma versão nova que vale a partir de um mês; os meses anteriores continuam com a versão da época.

No fechamento do mês (Ponto → Rateio), o custo que não foi para projeto nenhum aparece na linha **Não alocado**.
```

Em `docs/manual/novidades.md`, no topo:

```markdown
- **Custo da hora com encargos (outubro/2026):** o rateio de horas passa a incluir FGTS, reservas de 13º, férias e aviso prévio, benefícios e a taxa do IEL, com tabelas em RH → Encargos. O custo fora dos projetos aparece como "Não alocado".
```

- [ ] **Step 2: CLAUDE.md**

Na seção Architecture, depois do bloco "Etapas no card, ponto e avisos da EAP", acrescentar:

```markdown
**Rateio de horas — custo da hora** (`modules/rh/rateio/`, spec `docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md`,
plano `docs/superpowers/plans/2026-10-11-rateio-horas-r1-custo-da-hora.md`): from `rh.rateio.calculoNovoDesde` (`2026-10`) the hour
cost is the person's MONTH cost ÷ minutes marked (`custo-hora/encargos.ts` + `distribuicao.ts`, pure, cents). Month cost = holerite
proventos (salário-família out) or `HistoricoContratual.remuneracao` + the `TabelaEncargos` version valid that month (one per
contratação, `vigenciaEm` = 1st of month, `parametros` = `parametrosEncargosSchema`). Sócio divides by a reference jornada (vínculo
`cargaSemanal`), PJ/autônomo carry hours only. What reaches no project is the `nao_alocado` line (`RateioHora.projetoId` null).
`FechamentoRateio` is the month header (`calculo` legado|v2) — "is the month closed?" reads it, never `rateioHora.findFirst`.
Earlier months keep `calcularRateioLegado`. Readers go through `calcularRateioDoMes`.
```

- [ ] **Step 3: Spec**

No topo de `docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md`, abaixo de "Atualizado em…", acrescentar:

```markdown
**Implementação:** R1 (decisões 1–9 e 15) entregue — plano `docs/superpowers/plans/2026-10-11-rateio-horas-r1-custo-da-hora.md`. R2 a R5 no roteiro do mesmo plano.
```

- [ ] **Step 4: Verificação completa**

```bash
npm run lint
npm test
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.server.json
npm run smoke:rateio-custo-hora
```
Com o `next dev` **parado**: `npm run build`.
Expected: tudo verde; o smoke termina com "Tudo certo.".

- [ ] **Step 5: Commit**

```bash
git add docs/manual/rh-ponto/folha-clt.md docs/manual/novidades.md CLAUDE.md docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md
git commit -m "docs(rateio): custo da hora com encargos no manual, novidades e CLAUDE.md"
```

## Deploy (anotar no runbook quando for promover)

1. `npx prisma migrate deploy` (inclui `20261011120000_rateio_custo_hora_v2`: cria a tabela de encargos com a versão de 10/2026, marca os estagiários ativos como IEL e grava o corte `2026-10`).
2. Conferir em RH → Encargos se os valores batem com a decisão 4 e se os estagiários contratados direto estão marcados como tal.
3. Rodar `npm run smoke:rateio-custo-hora` no servidor (só leitura).
