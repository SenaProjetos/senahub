import { describe, expect, it } from "vitest";
import {
  margemLiquida,
  percentualInadimplencia,
  pontoDeEquilibrio,
  prazoMedioDias,
  receitaPorProjetoAtivo,
  tipoCustoEfetivo,
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

describe("ponto de equilíbrio (margem de contribuição)", () => {
  it("fixos ÷ (1 − variáveis ÷ receita)", () => {
    // Receita 87.000; variáveis 16.250 (18,68%); fixos 45.000 → 45.000 ÷ 0,8132… = 55.335,69.
    expect(pontoDeEquilibrio({ fixos: 45_000, variaveis: 16_250, receita: 87_000 })).toBe(55_335.69);
  });
  it("só custo fixo: o ponto é o próprio custo", () => {
    expect(pontoDeEquilibrio({ fixos: 40_000, variaveis: 0, receita: 87_000 })).toBe(40_000);
  });
  it("sem receita no período não há margem: contam só os fixos", () => {
    expect(pontoDeEquilibrio({ fixos: 30_000, variaveis: 5_000, receita: 0 })).toBe(30_000);
  });
  it("variáveis comendo toda a receita: nenhum faturamento cobre — null", () => {
    expect(pontoDeEquilibrio({ fixos: 10_000, variaveis: 50_000, receita: 50_000 })).toBeNull();
    expect(pontoDeEquilibrio({ fixos: 10_000, variaveis: 60_000, receita: 50_000 })).toBeNull();
  });
});

describe("tipo de custo efetivo", () => {
  it("o próprio vence; senão o ancestral mais próximo; sem nada, fixo", () => {
    expect(tipoCustoEfetivo(["variavel", "fixo"])).toBe("variavel");
    expect(tipoCustoEfetivo([null, undefined, "variavel", "fixo"])).toBe("variavel");
    expect(tipoCustoEfetivo([null, null])).toBe("fixo");
    expect(tipoCustoEfetivo([])).toBe("fixo");
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
