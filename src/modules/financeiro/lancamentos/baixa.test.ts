import { describe, expect, it } from "vitest";
import {
  CHAVE_DESCONTOS_CONCEDIDOS,
  CHAVE_DESCONTOS_OBTIDOS,
  CHAVE_JUROS_PAGOS,
  CHAVE_JUROS_RECEBIDOS,
  chaveNfeValida,
  MOTIVO_DESCONTO_MAIOR,
  MOTIVO_DESCONTO_PARCIAL,
  MOTIVO_NEGATIVO,
  MOTIVO_PRINCIPAL_MAIOR,
  normalizarChaveNfe,
  planejarBaixa,
} from "@/modules/financeiro/lancamentos/baixa";

describe("baixa simples", () => {
  it("sem nada informado: quita o título inteiro, sem acessório", () => {
    expect(planejarBaixa({ tipo: "despesa", valor: 1_000_00 })).toEqual({ valorEfetivo: null, restante: null, acessorios: [], caixa: 1_000_00 });
  });
  it("parcial: o principal vira o efetivo e o resto fica em aberto", () => {
    expect(planejarBaixa({ tipo: "despesa", valor: 1_000_00, principal: 400_00 })).toEqual({ valorEfetivo: 400_00, restante: 600_00, acessorios: [], caixa: 400_00 });
  });
  it("principal acima do título é recusado: o excedente é juros", () => {
    expect(planejarBaixa({ tipo: "despesa", valor: 1_000_00, principal: 1_050_00 })).toEqual({ erro: MOTIVO_PRINCIPAL_MAIOR });
  });
});

describe("pagamento com juros, multa e desconto", () => {
  it("juros + multa: uma despesa financeira e o caixa sai a mais", () => {
    const p = planejarBaixa({ tipo: "despesa", valor: 1_000_00, juros: 12_50, multa: 20_00 });
    expect(p).toEqual({ valorEfetivo: null, restante: null, acessorios: [{ tipo: "despesa", chaveCategoria: CHAVE_JUROS_PAGOS, valor: 32_50, rotulo: "Juros e multa" }], caixa: 1_032_50 });
  });
  it("quitar com desconto: o título sai inteiro, o desconto é receita financeira e o caixa sai a menos", () => {
    const p = planejarBaixa({ tipo: "despesa", valor: 1_000_00, desconto: 50_00 });
    expect(p).toEqual({ valorEfetivo: null, restante: null, acessorios: [{ tipo: "receita", chaveCategoria: CHAVE_DESCONTOS_OBTIDOS, valor: 50_00, rotulo: "Desconto obtido" }], caixa: 950_00 });
  });
  it("desconto num parcial não existe: o que falta é aberto, não desconto", () => {
    expect(planejarBaixa({ tipo: "despesa", valor: 1_000_00, principal: 500_00, desconto: 10_00 })).toEqual({ erro: MOTIVO_DESCONTO_PARCIAL });
  });
  it("juros num parcial pode (atrasou e pagou só uma parte)", () => {
    expect(planejarBaixa({ tipo: "despesa", valor: 1_000_00, principal: 500_00, juros: 5_00 })).toMatchObject({ valorEfetivo: 500_00, restante: 500_00, caixa: 505_00 });
  });
  it("desconto do tamanho do título e valores negativos são recusados", () => {
    expect(planejarBaixa({ tipo: "despesa", valor: 100_00, desconto: 100_00 })).toEqual({ erro: MOTIVO_DESCONTO_MAIOR });
    expect(planejarBaixa({ tipo: "despesa", valor: 100_00, juros: -1 })).toEqual({ erro: MOTIVO_NEGATIVO });
  });
});

describe("recebimento: os sinais se invertem", () => {
  it("juros recebidos são receita; desconto concedido é despesa", () => {
    const p = planejarBaixa({ tipo: "receita", valor: 2_000_00, juros: 10_00, desconto: 100_00 });
    expect(p).toEqual({
      valorEfetivo: null,
      restante: null,
      acessorios: [
        { tipo: "receita", chaveCategoria: CHAVE_JUROS_RECEBIDOS, valor: 10_00, rotulo: "Juros e multa" },
        { tipo: "despesa", chaveCategoria: CHAVE_DESCONTOS_CONCEDIDOS, valor: 100_00, rotulo: "Desconto concedido" },
      ],
      caixa: 1_910_00,
    });
  });
});

describe("chave da NF", () => {
  // Chave de teste: 43 dígitos + DV calculado à parte pela regra do manual (módulo 11, pesos 2 a 9).
  const valida = "35200714200166000187550010000000046550010007";
  it("44 dígitos com o dígito verificador certo", () => {
    expect(chaveNfeValida(valida)).toBe(true);
    expect(chaveNfeValida(valida.slice(0, 43) + "8")).toBe(false);
    expect(chaveNfeValida("123")).toBe(false);
  });
  it("aceita com espaços e pontos", () => {
    const espacada = valida.replace(/(\d{4})/g, "$1 ").trim();
    expect(normalizarChaveNfe(espacada)).toBe(valida);
    expect(chaveNfeValida(espacada)).toBe(true);
  });
});
