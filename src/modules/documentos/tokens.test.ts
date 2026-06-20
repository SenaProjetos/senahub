import { describe, it, expect } from "vitest";
import {
  resolverTexto,
  formatar,
  avaliarAritmetica,
  paraNumero,
  type ContextoDados,
} from "@/modules/documentos/tokens";

/** Normaliza o NBSP que o toLocaleString pt-BR usa em moeda. */
const n = (s: string) => s.replace(/ /g, " ");

const ctx: ContextoDados = {
  escalar: { ClienteNome: "Alfreds Futterkiste", ProjetoCodigo: "26-0142", Total: 5000 },
  linhas: [
    { Descricao: "Estrutural", Valor: 1200.5, Qtd: 1 },
    { Descricao: "Hidráulica", Valor: 800, Qtd: 2 },
  ],
  pagina: 1,
  paginas: 3,
};

describe("motor de tokens dos documentos", () => {
  it("resolve campo escalar", () => {
    expect(resolverTexto("Cliente: [ClienteNome]", ctx)).toBe("Cliente: Alfreds Futterkiste");
  });

  it("resolve campo com prefixo de fonte (usa o final)", () => {
    expect(resolverTexto("[Clientes.ClienteNome]", ctx)).toBe("Alfreds Futterkiste");
  });

  it("linha atual tem precedência no detalhe", () => {
    const c = { ...ctx, linha: ctx.linhas[0] };
    expect(n(resolverTexto("[Descricao] — [Valor:c2]", c))).toBe("Estrutural — R$ 1.200,50");
  });

  it("agregados Sum/Count/Avg sobre as linhas", () => {
    expect(n(resolverTexto("[Sum(Valor):c2]", ctx))).toBe("R$ 2.000,50");
    expect(resolverTexto("[Count()]", ctx)).toBe("2");
    expect(resolverTexto("[Avg(Qtd):n1]", ctx)).toBe("1,5");
  });

  it("formatos: moeda, número, percentual, data", () => {
    expect(n(formatar(1234.5, "c2"))).toBe("R$ 1.234,50");
    expect(formatar(1234.5, "n0")).toBe("1.235");
    expect(formatar(12.345, "p1")).toBe("12,3%");
    expect(formatar(new Date(2026, 5, 9), "d")).toBe("09/06/2026");
  });

  it("Pagina/Paginas/Hoje", () => {
    expect(resolverTexto("Página [Pagina] de [Paginas]", ctx)).toBe("Página 1 de 3");
    expect(resolverTexto("[Hoje]", ctx)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("token desconhecido vira vazio; texto sem token intacto", () => {
    expect(resolverTexto("[NaoExiste]!", ctx)).toBe("!");
    expect(resolverTexto("Sem tokens", ctx)).toBe("Sem tokens");
  });

  it("dois-pontos no texto não vira formato (Net 30: obrigado)", () => {
    expect(resolverTexto("[ClienteNome]: obrigado", ctx)).toBe("Alfreds Futterkiste: obrigado");
  });
});

describe("avaliador aritmético seguro (shunting-yard)", () => {
  it("soma e subtração", () => {
    expect(avaliarAritmetica("2 + 3")).toBe(5);
    expect(avaliarAritmetica("10 - 4 - 1")).toBe(5);
  });

  it("multiplicação e divisão", () => {
    expect(avaliarAritmetica("6 * 7")).toBe(42);
    expect(avaliarAritmetica("20 / 4")).toBe(5);
  });

  it("precedência: * antes de +", () => {
    expect(avaliarAritmetica("2 + 3 * 4")).toBe(14);
    expect(avaliarAritmetica("10 - 2 * 3")).toBe(4);
  });

  it("parênteses alteram a precedência", () => {
    expect(avaliarAritmetica("(2 + 3) * 4")).toBe(20);
    expect(avaliarAritmetica("2 * (3 + (4 - 1))")).toBe(12);
  });

  it("decimais e menos unário", () => {
    expect(avaliarAritmetica("0.5 * 10")).toBe(5);
    expect(avaliarAritmetica("-3 + 5")).toBe(2);
    expect(avaliarAritmetica("-(2 + 3)")).toBe(-5);
  });

  it("divisão por zero → null", () => {
    expect(avaliarAritmetica("5 / 0")).toBeNull();
  });

  it("expressão inválida → null", () => {
    expect(avaliarAritmetica("2 +")).toBeNull();
    expect(avaliarAritmetica("(2 + 3")).toBeNull();
    expect(avaliarAritmetica("2 # 3")).toBeNull();
  });
});

describe("paraNumero (pt-BR)", () => {
  it("converte separadores pt-BR e ponto decimal", () => {
    expect(paraNumero("1.200,50")).toBe(1200.5);
    expect(paraNumero("1200,5")).toBe(1200.5);
    expect(paraNumero("1200.5")).toBe(1200.5);
    expect(paraNumero(42)).toBe(42);
  });
  it("vazio/inválido → NaN", () => {
    expect(Number.isNaN(paraNumero(""))).toBe(true);
    expect(Number.isNaN(paraNumero(null))).toBe(true);
  });
});

describe("campo calculado [= EXPR]", () => {
  it("multiplicação com token e literal pt-BR", () => {
    // Total = 5000 → 5000 * 0,1 = 500
    expect(resolverTexto("[= [Total] * 0,1 ]", ctx)).toBe("500");
  });

  it("agregados dentro da fórmula (média manual)", () => {
    // Sum(Valor)=2000,5 ; Count()=2 → 1000,25 (pt-BR, com separador de milhar)
    expect(resolverTexto("[= [Sum(Valor)] / [Count()] ]", ctx)).toBe("1.000,25");
  });

  it("respeita o sufixo de formato externo", () => {
    expect(n(resolverTexto("[= [Total] * 0,1 :c2]", ctx))).toBe("R$ 500,00");
  });

  it("precedência e parênteses dentro da fórmula", () => {
    // (Total + 1000) * 2 = (5000+1000)*2 = 12000
    expect(resolverTexto("[= ([Total] + 1000) * 2 ]", ctx)).toBe("12.000");
  });

  it("token inexistente vira 0 dentro da fórmula", () => {
    // NaoExiste → 0 ; 0 + 5 = 5
    expect(resolverTexto("[= [NaoExiste] + 5 ]", ctx)).toBe("5");
  });

  it("fórmula inválida resolve para vazio", () => {
    expect(resolverTexto("[= [Total] / 0 ]", ctx)).toBe("");
  });
});
