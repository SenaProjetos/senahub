import { describe, it, expect } from "vitest";
import { avaliarCondicao } from "@/modules/documentos/condicoes";
import type { ContextoDados } from "@/modules/documentos/tokens";

const ctx: ContextoDados = {
  escalar: {
    Status: "Aprovado",
    Total: 1500,
    Observacao: "",
    Cliente: "Alfa",
  },
  linhas: [
    { Valor: 1200.5 },
    { Valor: 800 },
  ],
  pagina: 1,
  paginas: 1,
};

describe("avaliarCondicao", () => {
  it("expressão ausente (undefined) → true", () => {
    expect(avaliarCondicao(undefined, ctx)).toBe(true);
  });

  it("expressão vazia → true", () => {
    expect(avaliarCondicao("", ctx)).toBe(true);
    expect(avaliarCondicao("   ", ctx)).toBe(true);
  });

  it("igualdade de texto com aspas", () => {
    expect(avaliarCondicao('[Status] == "Aprovado"', ctx)).toBe(true);
    expect(avaliarCondicao('[Status] == "Rejeitado"', ctx)).toBe(false);
  });

  it("desigualdade de texto", () => {
    expect(avaliarCondicao('[Status] != "Rejeitado"', ctx)).toBe(true);
    expect(avaliarCondicao('[Status] != "Aprovado"', ctx)).toBe(false);
  });

  it("comparação textual sem aspas (texto livre)", () => {
    expect(avaliarCondicao("[Cliente] == Alfa", ctx)).toBe(true);
    expect(avaliarCondicao("[Cliente] == Beta", ctx)).toBe(false);
  });

  it("comparação textual é case-insensitive", () => {
    expect(avaliarCondicao('[Status] == "aprovado"', ctx)).toBe(true);
  });

  it("comparação numérica >, >=, <, <=", () => {
    expect(avaliarCondicao("[Total] > 1000", ctx)).toBe(true);
    expect(avaliarCondicao("[Total] > 2000", ctx)).toBe(false);
    expect(avaliarCondicao("[Total] >= 1500", ctx)).toBe(true);
    expect(avaliarCondicao("[Total] < 2000", ctx)).toBe(true);
    expect(avaliarCondicao("[Total] <= 1500", ctx)).toBe(true);
    expect(avaliarCondicao("[Total] == 1500", ctx)).toBe(true);
  });

  it("comparação numérica com agregado [Sum(...)]", () => {
    // 1200.5 + 800 = 2000.5
    expect(avaliarCondicao("[Sum(Valor)] > 2000", ctx)).toBe(true);
    expect(avaliarCondicao("[Sum(Valor)] < 2000", ctx)).toBe(false);
  });

  it("número pt-BR no lado direito (vírgula decimal)", () => {
    expect(avaliarCondicao("[Sum(Valor)] > 2000,4", ctx)).toBe(true);
    expect(avaliarCondicao("[Sum(Valor)] > 2000,9", ctx)).toBe(false);
  });

  it("vazio() e naoVazio()", () => {
    expect(avaliarCondicao("vazio([Observacao])", ctx)).toBe(true);
    expect(avaliarCondicao("naoVazio([Observacao])", ctx)).toBe(false);
    expect(avaliarCondicao("naoVazio([Cliente])", ctx)).toBe(true);
    expect(avaliarCondicao("vazio([Cliente])", ctx)).toBe(false);
  });

  it("token sem colchetes também é aceito", () => {
    expect(avaliarCondicao("Status == Aprovado", ctx)).toBe(true);
    expect(avaliarCondicao("naoVazio(Cliente)", ctx)).toBe(true);
  });

  it("expressão sem operador reconhecido → true (falha aberta)", () => {
    expect(avaliarCondicao("texto solto", ctx)).toBe(true);
  });

  it("usa a linha atual quando presente (detalhe)", () => {
    const c: ContextoDados = { ...ctx, linha: { Valor: 1200.5 } };
    expect(avaliarCondicao("[Valor] > 1000", c)).toBe(true);
    expect(avaliarCondicao("[Valor] < 1000", c)).toBe(false);
  });
});
