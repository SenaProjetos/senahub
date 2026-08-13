import { describe, it, expect } from "vitest";
import { ratearPagamentoProjetista, bloqueioValorDisciplina } from "@/modules/uploads/rateio";

const pj = (id: string) => ({ userId: id, user: { role: "projetista_pj" } });
const free = (id: string) => ({ userId: id, user: { role: "freelancer" } });
const clt = (id: string) => ({ userId: id, user: { role: "clt" } });
const estagiario = (id: string) => ({ userId: id, user: { role: "estagiario" } });

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
