import { describe, expect, it } from "vitest";
import {
  margemLiquida,
  percentualInadimplencia,
  pontoDeEquilibrio,
  prazoMedioDias,
  receitaPorProjetoAtivo,
  variacaoPontosPercentuais,
} from "@/modules/financeiro/relatorios/indicadores-gerenciais";

describe("margem líquida", () => {
  it("resultado sobre receita, em %, uma casa", () => {
    expect(margemLiquida(87_000, 25_750)).toBe(29.6);
    expect(margemLiquida(100, -10)).toBe(-10);
  });
  it("sem receita, null (não divide por zero)", () => {
    expect(margemLiquida(0, 0)).toBeNull();
  });
});

describe("variação em pontos percentuais", () => {
  it("diferença entre duas margens", () => {
    expect(variacaoPontosPercentuais(29.6, 18.7)).toBe(10.9);
  });
  it("sem uma das margens, null", () => {
    expect(variacaoPontosPercentuais(29.6, null)).toBeNull();
  });
});

describe("ponto de equilíbrio", () => {
  it("é a despesa do mês (aproximação documentada)", () => {
    expect(pontoDeEquilibrio(56_400)).toBe(56_400);
  });
});

describe("inadimplência", () => {
  it("vencido há mais de 30 dias sobre o faturado em 12 meses", () => {
    expect(percentualInadimplencia(3_200, 100_000)).toBe(3.2);
  });
  it("sem faturamento, null", () => {
    expect(percentualInadimplencia(100, 0)).toBeNull();
  });
});

describe("prazo médio", () => {
  it("média simples dos dias", () => {
    expect(prazoMedioDias([{ dias: 10 }, { dias: 20 }, { dias: 30 }])).toBe(20);
  });
  it("lista vazia, null", () => {
    expect(prazoMedioDias([])).toBeNull();
  });
});

describe("receita por projeto ativo", () => {
  it("divide a receita pelos projetos em andamento", () => {
    expect(receitaPorProjetoAtivo(87_000, 12)).toBe(7_250);
  });
  it("sem projeto ativo, null", () => {
    expect(receitaPorProjetoAtivo(1000, 0)).toBeNull();
  });
});
