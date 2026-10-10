import { describe, it, expect } from "vitest";
import { ratearPagamentoProjetista, bloqueioValorDisciplina, tipoProfissionalDoPagamento } from "@/modules/uploads/rateio";

// Pagável pela CONTRATAÇÃO desde a Onda F (bloco D): PJ e RPA (o freelancer migrado) recebem por
// entrega; CLT/estágio não; sem vínculo também não.
const pj = (id: string) => ({ userId: id, user: { contratacao: "pj" as const } });
const free = (id: string) => ({ userId: id, user: { contratacao: "autonomo_rpa" as const } });
const clt = (id: string) => ({ userId: id, user: { contratacao: "clt" as const } });
const estagiario = (id: string) => ({ userId: id, user: { contratacao: "estagio" as const } });
const semVinculo = (id: string) => ({ userId: id, user: { contratacao: null } });

const soma = (p: { valor: number }[]) => Number(p.reduce((s, i) => s + i.valor, 0).toFixed(2));

describe("ratearPagamentoProjetista", () => {
  it("responsável único pagável recebe o valor inteiro", () => {
    const { pagaveis, salariados } = ratearPagamentoProjetista([pj("a")], 1500);
    expect(pagaveis).toEqual([{ responsavel: pj("a"), valor: 1500 }]);
    expect(salariados).toEqual([]);
  });

  it("divide igualmente entre pagáveis", () => {
    const { pagaveis } = ratearPagamentoProjetista([pj("a"), free("b")], 400);
    expect(pagaveis.map((p) => p.valor)).toEqual([200, 200]);
  });

  it("sobra de centavos vai para o primeiro pagável e a soma fecha", () => {
    const { pagaveis } = ratearPagamentoProjetista([pj("a"), pj("b"), pj("c")], 100);
    expect(pagaveis.map((p) => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(soma(pagaveis)).toBe(100);
  });

  it("CLT/estagiário não consomem cota — pagável leva o pool inteiro", () => {
    const { pagaveis, salariados } = ratearPagamentoProjetista([clt("a"), pj("b")], 1000);
    expect(pagaveis).toEqual([{ responsavel: pj("b"), valor: 1000 }]);
    expect(salariados).toEqual([clt("a")]);
  });

  it("sobra não se perde quando o índice 0 é salariado", () => {
    const { pagaveis } = ratearPagamentoProjetista([clt("a"), pj("b"), pj("c"), pj("d")], 100);
    expect(soma(pagaveis)).toBe(100);
    expect(pagaveis[0].valor).toBe(33.34);
  });

  it("sem vínculo não é pagável (decisão 1 do dono: o backfill vem antes do deploy)", () => {
    const { pagaveis, salariados } = ratearPagamentoProjetista([semVinculo("a"), pj("b")], 300);
    expect(pagaveis).toEqual([{ responsavel: pj("b"), valor: 300 }]);
    expect(salariados).toEqual([semVinculo("a")]);
  });

  it("disciplina 100% salariada não gera cota", () => {
    const { pagaveis, salariados } = ratearPagamentoProjetista([clt("a"), estagiario("b")], 800);
    expect(pagaveis).toEqual([]);
    expect(salariados).toHaveLength(2);
  });

  it("sem responsáveis não gera cota", () => {
    expect(ratearPagamentoProjetista([], 500)).toEqual({ pagaveis: [], salariados: [] });
  });
});

describe("bloqueioValorDisciplina", () => {
  it("libera quando há valor e responsável pagável", () => {
    expect(bloqueioValorDisciplina([pj("a")], 1500)).toBeNull();
  });

  it("bloqueia valor nulo com responsável pagável", () => {
    expect(bloqueioValorDisciplina([pj("a")], null)).toMatch(/valor de pagamento/i);
  });

  it("bloqueia valor zero — origem das linhas R$ 0,00 na folha", () => {
    expect(bloqueioValorDisciplina([clt("a"), free("b")], 0)).toMatch(/valor de pagamento/i);
  });

  it("libera disciplina 100% salariada sem valor", () => {
    expect(bloqueioValorDisciplina([clt("a"), estagiario("b")], null)).toBeNull();
  });

  it("libera disciplina sem responsáveis", () => {
    expect(bloqueioValorDisciplina([], null)).toBeNull();
  });
});

describe("tipoProfissionalDoPagamento — categoria do DRE (regra do dono, 2026-10-10)", () => {
  it("prestador COM CNPJ é PJ (2.01)", () => {
    expect(tipoProfissionalDoPagamento({ pjId: "pj-1" })).toBe("projetista_pj");
  });

  it("prestador SEM CNPJ é freelancer (2.02)", () => {
    expect(tipoProfissionalDoPagamento({ pjId: null })).toBe("freelancer");
  });
});
