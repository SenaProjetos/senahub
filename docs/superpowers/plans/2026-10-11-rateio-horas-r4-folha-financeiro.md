# Rateio de horas — R4: folha no financeiro, reabertura com motivo e custo total da folha

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (sessões 2 a 4 do roteiro). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a folha passa a lançar no financeiro, além do líquido, a bolsa dos estagiários, o INSS e o IRRF descontados, o FGTS e os benefícios; cada parte na subcategoria certa; reabrir a folha pede motivo, guarda a versão assinada de cada holerite e é recusado se alguma parte já foi paga; a tela da folha mostra o custo total (só admin/RH).

**Architecture:** Plano puro `src/modules/rh/folha/lancamentos-da-folha.ts` decide QUAIS contas a folha gera (parte, rótulo, categoria por chave, valor em centavos, vencimento). `fechamento-service.ts` grava: o líquido CLT segue o caminho atual (N0, conta da competência, recorrência) mas na subcategoria Salários; as outras partes são contas novas ligadas por `FolhaLancamento` (fechar de novo atualiza a mesma conta enquanto `previsto`). Reabrir usa a máquina de estados N1 (nunca `update` cru de status) e a trava N5.

**Tech Stack:** Next.js 15, Prisma 7, Zod, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md](../specs/2026-09-15-rateio-horas-decisoes.md) — decisões 17 (folha), 20, 21, 22, 24. CLAUDE.md: "Closing the CLT payroll DEFINES the value", "One state machine for every Lancamento", "A closed month is frozen", "System categories by chave".

**Schema:** já aplicado (migração `20261011150000_rateio_r2_r5`): `FolhaPagamento.totalInssRetido/totalIrrfRetido/totalFgts`, `FolhaLancamento`, `FolhaReabertura`, `HoleriteVersao`, subcategorias por chave (`despesa_folha_salarios`, `_fgts`, `_decimo_terceiro`, `_ferias`, `_rescisoes`, `_vale_transporte`, `_vale_refeicao`, `despesa_estagio_bolsa`, `despesa_estagio_taxa_agente`) e o compromisso recorrente da folha movido para Salários.

## Global Constraints

- Produtores escrevem direto (isentos de alçada por origem), mas toda escrita respeita `exigirPeriodoAberto` (N5) e nunca reescreve conta `confirmado` (N0).
- Valor em centavos no plano puro; `paraReais` só na gravação.
- Vencimentos: líquido e benefícios = o do salário (5º dia útil do mês seguinte, sábado conta — já calculado em `fecharFolhaNoBanco`); INSS, IRRF e FGTS = **dia 20 do mês seguinte**, antecipado para o dia útil anterior se cair em fim de semana/feriado (`diaUtilAnterior` de `lib/calendario-trabalho.ts` com `calendarioFinanceiro`).
- Subcategoria ausente no plano do usuário (código já ocupado) → cai na categoria-mãe por chave (`despesa_folha_clt` / `despesa_estagiarios`), nunca falha.
- Folha de 13º: o líquido vai em `despesa_folha_decimo_terceiro`; INSS/IRRF/FGTS do 13º seguem as mesmas regras; não há benefícios nem bolsa.
- Nada disso vai para a exportação contábil (decisão 24) — sem mudança aqui, só não marque nada para exportar.

## Review Focus

1. **Folha reaberta e fechada de novo** com o FGTS mudando de R$ 1.000 para R$ 1.050: a MESMA conta é atualizada; nenhuma conta nova.
2. **FGTS já pago e folha reaberta:** reabrir é recusado com a frase da máquina de estados ("estorne o pagamento antes").
3. **Folha só com estagiários** (sem CLT): não cria conta de líquido CLT vazia; cria só a bolsa.
4. **Totais retidos não informados (folha montada à mão):** fecha só com líquido e benefícios, e o aviso diz "INSS, IRRF e FGTS não informados — nada lançado".
5. **Mês do financeiro fechado (N5):** fechar a folha é recusado antes de gravar qualquer parte.

---

### Task R4.1: Plano puro dos lançamentos da folha (sessão 2, Sonnet high)

**Files:**
- Create: `src/modules/rh/folha/lancamentos-da-folha.ts`
- Test: `src/modules/rh/folha/lancamentos-da-folha.test.ts`

**Interfaces — Produces:**
```ts
export type ParteDaFolha = "liquido_clt" | "bolsa" | "inss_retido" | "irrf_retido" | "fgts" | "beneficio";
export type LancamentoPlanejado = { parte: ParteDaFolha; rotulo: string; chaveCategoria: string; valorCent: number; vence: "salario" | "dia20"; descricao: string };
export function planoDaFolha(p: {
  tipo: "mensal" | "decimo_terceiro";
  rotuloFolha: string;                 // "10/2026" ou "13º 2026"
  liquidoCltCent: number;              // soma líquida dos holerites de CLT
  liquidoEstagioCent: number;          // soma líquida dos holerites de estágio
  inssRetidoCent: number | null;
  irrfRetidoCent: number | null;
  fgtsCent: number | null;
  beneficios: { nome: string; valorCent: number }[]; // já somados por benefício, só CLT
}): { lancamentos: LancamentoPlanejado[]; avisos: string[] };
```

- [ ] **Step 1: Testes que falham**

```ts
// src/modules/rh/folha/lancamentos-da-folha.test.ts
import { describe, expect, it } from "vitest";
import { planoDaFolha } from "./lancamentos-da-folha";

const base = {
  tipo: "mensal" as const, rotuloFolha: "10/2026", liquidoCltCent: 1000000, liquidoEstagioCent: 300000,
  inssRetidoCent: 110000, irrfRetidoCent: 40000, fgtsCent: 96000,
  beneficios: [{ nome: "Vale-transporte", valorCent: 60000 }, { nome: "Vale-refeição", valorCent: 165000 }],
};
const resumo = (r: ReturnType<typeof planoDaFolha>) => r.lancamentos.map((l) => `${l.parte}:${l.rotulo}:${l.chaveCategoria}:${l.valorCent}:${l.vence}`);

describe("planoDaFolha (decisões 21 e 22)", () => {
  it("folha mensal completa", () => {
    expect(resumo(planoDaFolha(base))).toEqual([
      "liquido_clt::despesa_folha_salarios:1000000:salario",
      "bolsa::despesa_estagio_bolsa:300000:salario",
      "inss_retido::despesa_folha_salarios:110000:dia20",
      "irrf_retido::despesa_folha_salarios:40000:dia20",
      "fgts::despesa_folha_fgts:96000:dia20",
      "beneficio:Vale-transporte:despesa_folha_vale_transporte:60000:salario",
      "beneficio:Vale-refeição:despesa_folha_vale_refeicao:165000:salario",
    ]);
  });
  it("só estagiários: sem líquido CLT", () => {
    const r = planoDaFolha({ ...base, liquidoCltCent: 0, inssRetidoCent: null, irrfRetidoCent: null, fgtsCent: null, beneficios: [] });
    expect(resumo(r)).toEqual(["bolsa::despesa_estagio_bolsa:300000:salario"]);
  });
  it("totais retidos não informados: avisa e não lança", () => {
    const r = planoDaFolha({ ...base, inssRetidoCent: null, irrfRetidoCent: null, fgtsCent: null });
    expect(r.lancamentos.some((l) => l.vence === "dia20")).toBe(false);
    expect(r.avisos).toEqual(["INSS, IRRF e FGTS não informados — nada lançado para as guias."]);
  });
  it("valor zero não vira conta", () => {
    const r = planoDaFolha({ ...base, irrfRetidoCent: 0 });
    expect(r.lancamentos.some((l) => l.parte === "irrf_retido")).toBe(false);
  });
  it("benefício com nome fora do padrão vai para a mãe da folha", () => {
    const r = planoDaFolha({ ...base, beneficios: [{ nome: "Plano odontológico", valorCent: 5000 }] });
    expect(resumo(r).at(-1)).toBe("beneficio:Plano odontológico:despesa_folha_clt:5000:salario");
  });
  it("13º: líquido na subcategoria do 13º, sem bolsa nem benefícios", () => {
    const r = planoDaFolha({ ...base, tipo: "decimo_terceiro", rotuloFolha: "13º 2026" });
    expect(resumo(r)).toEqual([
      "liquido_clt::despesa_folha_decimo_terceiro:1000000:salario",
      "inss_retido::despesa_folha_decimo_terceiro:110000:dia20",
      "irrf_retido::despesa_folha_decimo_terceiro:40000:dia20",
      "fgts::despesa_folha_fgts:96000:dia20",
    ]);
  });
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementação**

```ts
// src/modules/rh/folha/lancamentos-da-folha.ts
/**
 * Quais contas a pagar o fechamento da folha gera (R4; decisões 21 e 22 do spec 2026-09-15). PURO, em
 * centavos. Categoria por CHAVE: a subcategoria; se o plano do usuário não a tiver, o gravador cai na mãe.
 */
export type ParteDaFolha = "liquido_clt" | "bolsa" | "inss_retido" | "irrf_retido" | "fgts" | "beneficio";
export type LancamentoPlanejado = { parte: ParteDaFolha; rotulo: string; chaveCategoria: string; valorCent: number; vence: "salario" | "dia20"; descricao: string };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function chaveDoBeneficio(nome: string): string {
  const n = semAcento(nome);
  if (n.includes("transporte")) return "despesa_folha_vale_transporte";
  if (n.includes("refeicao") || n.includes("alimentacao")) return "despesa_folha_vale_refeicao";
  return "despesa_folha_clt";
}

export function planoDaFolha(p: {
  tipo: "mensal" | "decimo_terceiro";
  rotuloFolha: string;
  liquidoCltCent: number;
  liquidoEstagioCent: number;
  inssRetidoCent: number | null;
  irrfRetidoCent: number | null;
  fgtsCent: number | null;
  beneficios: { nome: string; valorCent: number }[];
}): { lancamentos: LancamentoPlanejado[]; avisos: string[] } {
  const decimo = p.tipo === "decimo_terceiro";
  const salario = decimo ? "despesa_folha_decimo_terceiro" : "despesa_folha_salarios";
  const out: LancamentoPlanejado[] = [];
  const avisos: string[] = [];
  const add = (l: Omit<LancamentoPlanejado, "descricao">, descricao: string) => {
    if (l.valorCent > 0) out.push({ ...l, descricao: `${descricao} — folha ${p.rotuloFolha}` });
  };
  add({ parte: "liquido_clt", rotulo: "", chaveCategoria: salario, valorCent: p.liquidoCltCent, vence: "salario" }, "Folha CLT (líquido)");
  if (!decimo) add({ parte: "bolsa", rotulo: "", chaveCategoria: "despesa_estagio_bolsa", valorCent: p.liquidoEstagioCent, vence: "salario" }, "Bolsa de estágio");
  if (p.inssRetidoCent == null && p.irrfRetidoCent == null && p.fgtsCent == null) {
    avisos.push("INSS, IRRF e FGTS não informados — nada lançado para as guias.");
  } else {
    add({ parte: "inss_retido", rotulo: "", chaveCategoria: salario, valorCent: p.inssRetidoCent ?? 0, vence: "dia20" }, "INSS descontado dos funcionários");
    add({ parte: "irrf_retido", rotulo: "", chaveCategoria: salario, valorCent: p.irrfRetidoCent ?? 0, vence: "dia20" }, "IRRF descontado dos funcionários");
    add({ parte: "fgts", rotulo: "", chaveCategoria: "despesa_folha_fgts", valorCent: p.fgtsCent ?? 0, vence: "dia20" }, "FGTS");
  }
  if (!decimo) for (const b of p.beneficios) add({ parte: "beneficio", rotulo: b.nome, chaveCategoria: chaveDoBeneficio(b.nome), valorCent: b.valorCent, vence: "salario" }, b.nome);
  return { lancamentos: out, avisos };
}
```

- [ ] **Step 4: Ver passar. Step 5: Commit** — `feat(folha): plano das contas a pagar da folha (puro)`.

---

### Task R4.2: Gravar as partes no fechamento e reabrir com motivo (sessão 3 — por último, Opus high; xhigh se virar sessão 3b)

**Files:**
- Modify: `src/modules/rh/folha/fechamento-service.ts`, `src/modules/rh/folha/actions.ts` (`reabrirFolha` ganha `motivo`), `src/modules/rh/folha/importar-service.ts` (grava `totalInssRetido/totalIrrfRetido/totalFgts` do `resumo`), `src/modules/financeiro/categorias-sistema.ts` (acharCategoria por chave nova com reserva na mãe)
- Test: `scripts/smoke-folha-financeiro.ts` + `package.json` (`smoke:folha-financeiro`)

- [ ] **Step 1:** Separar a soma líquida por contratação do vínculo vigente no mês (CLT × estágio), lendo `vinculo` dos `holerite.userId`; benefícios do mês = soma dos itens `beneficio_*` de `custosDoMes(ano, mes, idsClt)` (R1), agrupados por `rotulo`.
- [ ] **Step 2:** `planoDaFolha` → o líquido CLT segue a lógica atual (`decidirContaDaFolha`, compromisso, vínculo de recorrência), com duas mudanças: `contasDaCompetencia` procura na mãe E em Salários (as contas antigas estão na mãe), e a conta criada nasce em Salários. Folha sem CLT: não cria a conta do líquido.
- [ ] **Step 3:** Demais partes: para cada `LancamentoPlanejado` (exceto `liquido_clt`), achar `FolhaLancamento (folhaId, parte, rotulo)`: existe e a conta está `previsto` → `updateMany` condicionado a `status: "previsto"` com o valor novo; existe e está `confirmado` → não mexe (aviso "já paga"); não existe → `lancamento.create` (status `previsto`, `dataCompetencia` = competência, vencimento pela regra) + `FolhaLancamento`. Parte que sumiu do plano e está `previsto` → cancelar pela máquina de estados (`exigirOperacao(…, "cancelar")` + `updateMany` condicionado), nunca apagar.
- [ ] **Step 4:** `reabrirFolhaNoBanco(folhaId, motivo, autorId)`: motivo 10+ caracteres; recusa se o líquido OU qualquer parte está `confirmado` (mesma frase de `motivoParaNaoReabrir`); na transação: para cada holerite assinado, `HoleriteVersao` com os itens e a assinatura; `FolhaReabertura`; revoga as assinaturas (como hoje). As contas `previsto` ficam (o próximo fechamento atualiza).
- [ ] **Step 5:** Smoke (banco de dev, competência de teste isolada): fechar folha com CLT + estagiário + totais → 7 contas e vencimentos certos (dia 20 ajustado ao dia útil); reabrir sem motivo recusa; reabrir com motivo grava versão e reabertura; fechar de novo com FGTS diferente atualiza a mesma conta; pagar o FGTS (pelo serviço de baixa) e tentar reabrir → recusa; mês N5 fechado → fechar recusa sem gravar. Regressão: `npm run smoke:financeiro-core` e `npm run smoke:planejador`.
- [ ] **Step 6:** Commit `feat(folha): fechamento lança guias, bolsa e benefícios; reabertura com motivo e versão assinada`.

---

### Task R4.3: Tela da folha (sessão 4, Sonnet medium)

**Files:**
- Modify: `src/components/rh/folha/folha-detalhe-view.tsx`, `src/app/(dashboard)/rh/folha/[id]/page.tsx`, `src/modules/rh/folha/queries.ts`

- [ ] **Step 1:** Campos "INSS descontado", "IRRF descontado" e "FGTS" (`InputMoeda`) editáveis com a folha aberta (action nova `salvarTotaisDaFolha`, `gereRh`, Zod com mensagens em português).
- [ ] **Step 2:** Bloco "Custo total da folha" (a página já é só de RH): salário bruto + encargos + benefícios por pessoa, de `custosDoMes`; total geral; lista das contas lançadas com situação (em aberto/paga) e link para o lançamento.
- [ ] **Step 3:** "Reabrir folha" abre um diálogo com motivo (10+ caracteres) e avisa que as assinaturas serão canceladas; histórico de reaberturas e, por holerite, "Versões assinadas" (data, motivo, itens).
- [ ] **Step 4:** Navegador 1366 e 390; commit `feat(folha): totais retidos, custo total e reabertura com motivo na tela`.
