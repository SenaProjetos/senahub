import { describe, expect, it } from "vitest";
import { relatorioImpacto, itensParaAtualizar, variacaoPercentual, type ItemParaTroca } from "./troca-data-base";

const item = (over: Partial<ItemParaTroca> & Pick<ItemParaTroca, "id">): ItemParaTroca => ({
  codigo: "1.1",
  descricao: "Serviço",
  quantidade: 1,
  custoAtual: 100,
  custoNovo: 100,
  bloqueado: false,
  ...over,
});

describe("variacaoPercentual", () => {
  it("calcula alta e baixa", () => {
    expect(variacaoPercentual(100, 110)).toBe(10);
    expect(variacaoPercentual(100, 80)).toBe(-20);
  });
  it("sem mudança é zero", () => {
    expect(variacaoPercentual(100, 100)).toBe(0);
    expect(variacaoPercentual(0, 0)).toBe(0);
  });
  it("de zero para valor não divide por zero", () => {
    expect(variacaoPercentual(0, 50)).toBe(100);
  });
});

describe("relatorioImpacto", () => {
  it("classifica as 4 situações", () => {
    const r = relatorioImpacto([
      item({ id: "a", custoAtual: 100, custoNovo: 120 }), // alterado
      item({ id: "b", custoAtual: 100, custoNovo: 100 }), // inalterado
      item({ id: "c", custoAtual: 100, custoNovo: null }), // sem preço na nova
      item({ id: "d", custoAtual: 100, custoNovo: 999, bloqueado: true }), // travado
    ]);
    expect(r.linhas.map((l) => l.situacao)).toEqual([
      "alterado",
      "inalterado",
      "sem_preco_na_nova",
      "bloqueado_preservado",
    ]);
    expect(r.contagem).toEqual({
      alterado: 1,
      inalterado: 1,
      sem_preco_na_nova: 1,
      bloqueado_preservado: 1,
    });
  });

  it("item travado preserva o custo mesmo com preço novo disponível", () => {
    const r = relatorioImpacto([item({ id: "a", custoAtual: 100, custoNovo: 500, bloqueado: true })]);
    expect(r.linhas[0].custoDepois).toBe(100);
    expect(r.linhas[0].variacaoPct).toBe(0);
  });

  it("item sem preço na base nova preserva o custo atual (não zera)", () => {
    const r = relatorioImpacto([item({ id: "a", custoAtual: 80, custoNovo: null })]);
    expect(r.linhas[0].custoDepois).toBe(80);
    expect(r.linhas[0].totalDepois).toBe(80);
  });

  it("totais agregados e variação global", () => {
    const r = relatorioImpacto([
      item({ id: "a", quantidade: 2, custoAtual: 100, custoNovo: 150 }), // 200 → 300
      item({ id: "b", quantidade: 1, custoAtual: 100, custoNovo: 100 }), // 100 → 100
    ]);
    expect(r.totalAntes).toBe(300);
    expect(r.totalDepois).toBe(400);
    expect(r.variacaoPct).toBeCloseTo(33.33, 2);
  });

  it("lista vazia não quebra", () => {
    const r = relatorioImpacto([]);
    expect(r.totalAntes).toBe(0);
    expect(r.totalDepois).toBe(0);
    expect(r.variacaoPct).toBe(0);
  });
});

describe("itensParaAtualizar", () => {
  it("devolve só os alterados — travado e sem-preço ficam de fora da gravação", () => {
    const r = relatorioImpacto([
      item({ id: "a", custoAtual: 100, custoNovo: 120 }),
      item({ id: "b", custoAtual: 100, custoNovo: 100 }),
      item({ id: "c", custoAtual: 100, custoNovo: null }),
      item({ id: "d", custoAtual: 100, custoNovo: 200, bloqueado: true }),
    ]);
    expect(itensParaAtualizar(r).map((l) => l.id)).toEqual(["a"]);
  });
});
