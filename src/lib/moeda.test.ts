import { describe, expect, it } from "vitest";
import {
  MAX_DIGITOS_MOEDA,
  alternarSinal,
  aplicarDigito,
  apagarDigito,
  colarParaDigitos,
  digitosParaValor,
  formatarDigitos,
  formatarMoeda,
  valorParaDigitos,
} from "./moeda";

/** Simula a digitação tecla a tecla num campo vazio. */
function digitar(texto: string, inicial = ""): string {
  return [...texto].reduce((buf, t) => aplicarDigito(buf, t), inicial);
}

describe("formatarMoeda", () => {
  it("formata em pt-BR sem símbolo", () => {
    expect(formatarMoeda(1500.5)).toBe("1.500,50");
    expect(formatarMoeda(0)).toBe("0,00");
    expect(formatarMoeda(1400)).toBe("1.400,00");
    expect(formatarMoeda(1234567.89)).toBe("1.234.567,89");
  });
});

describe("digitação da direita para a esquerda", () => {
  it("cresce dos centavos para os reais", () => {
    expect(formatarDigitos(digitar("5"))).toBe("0,05");
    expect(formatarDigitos(digitar("50"))).toBe("0,50");
    expect(formatarDigitos(digitar("500"))).toBe("5,00");
    expect(formatarDigitos(digitar("150050"))).toBe("1.500,50");
  });

  it("ignora teclas que não são dígito", () => {
    expect(digitar("1a2,3.4-5")).toBe("12345");
  });

  it("backspace desloca o número de volta", () => {
    const buf = digitar("150050"); // 1.500,50
    const um = apagarDigito(buf);
    expect(formatarDigitos(um)).toBe("150,05");
    expect(formatarDigitos(apagarDigito(um))).toBe("15,00");
  });

  it("esvazia até campo vazio, não até 0,00", () => {
    let buf = digitar("5");
    buf = apagarDigito(buf);
    expect(buf).toBe("");
    expect(formatarDigitos(buf)).toBe("");
    expect(digitosParaValor(buf)).toBeNull();
    expect(apagarDigito("")).toBe("");
  });

  it("limita o número de dígitos", () => {
    const buf = digitar("9".repeat(MAX_DIGITOS_MOEDA + 5));
    expect(buf).toHaveLength(MAX_DIGITOS_MOEDA);
    expect(aplicarDigito(buf, "9")).toBe(buf);
  });

  it("não acumula zeros à esquerda", () => {
    expect(digitar("000123")).toBe("123");
    expect(formatarDigitos(digitar("000123"))).toBe("1,23");
    expect(formatarDigitos(digitar("0"))).toBe("0,00");
  });
});

describe("hidratação de valor existente", () => {
  it("valor do banco é lido em REAIS, não em centavos", () => {
    // O caso do print: campo já contém 1400.
    expect(formatarDigitos(valorParaDigitos(1400))).toBe("1.400,00");
    expect(formatarDigitos(valorParaDigitos(1500.5))).toBe("1.500,50");
    expect(formatarDigitos(valorParaDigitos(0.05))).toBe("0,05");
    expect(formatarDigitos(valorParaDigitos(0))).toBe("0,00");
  });

  it("digitar o mesmo texto do valor hidratado dá resultado diferente (por desenho)", () => {
    expect(formatarDigitos(valorParaDigitos(1400))).toBe("1.400,00");
    expect(formatarDigitos(digitar("1400"))).toBe("14,00");
  });

  it("nulo e indefinido viram campo vazio", () => {
    expect(valorParaDigitos(null)).toBe("");
    expect(valorParaDigitos(undefined)).toBe("");
    expect(valorParaDigitos(Number.NaN)).toBe("");
  });

  it("ida e volta preserva o valor", () => {
    for (const v of [0, 0.01, 0.99, 1, 1400, 1500.5, 99999.99, 1234567.89]) {
      expect(digitosParaValor(valorParaDigitos(v))).toBeCloseTo(v, 2);
    }
  });

  it("arredonda ruído de ponto flutuante", () => {
    expect(formatarDigitos(valorParaDigitos(0.1 + 0.2))).toBe("0,30");
    // 1.005 em binário é 1.00499…, então arredonda para baixo — comportamento
    // esperado de float; o banco guarda Decimal, isto é só a exibição.
    expect(formatarDigitos(valorParaDigitos(1.005))).toBe("1,00");
    expect(formatarDigitos(valorParaDigitos(0.1 + 0.7))).toBe("0,80");
  });
});

describe("colar", () => {
  it("com separador decimal, lê como reais", () => {
    expect(formatarDigitos(colarParaDigitos("1.500,50") ?? "")).toBe("1.500,50");
    expect(formatarDigitos(colarParaDigitos("R$ 1.500,50") ?? "")).toBe("1.500,50");
    expect(formatarDigitos(colarParaDigitos("1500,5") ?? "")).toBe("1.500,50");
    expect(formatarDigitos(colarParaDigitos("1500.50") ?? "")).toBe("1.500,50");
  });

  it("ponto com 3 dígitos finais é milhar", () => {
    expect(formatarDigitos(colarParaDigitos("1.400") ?? "")).toBe("1.400,00");
    expect(formatarDigitos(colarParaDigitos("1.234.567") ?? "")).toBe("1.234.567,00");
  });

  it("só dígitos, lê como centavos", () => {
    expect(formatarDigitos(colarParaDigitos("150050") ?? "")).toBe("1.500,50");
    expect(formatarDigitos(colarParaDigitos("5") ?? "")).toBe("0,05");
  });

  it("texto sem número é rejeitado", () => {
    expect(colarParaDigitos("")).toBeNull();
    expect(colarParaDigitos("R$")).toBeNull();
    expect(colarParaDigitos("abc")).toBeNull();
  });
});

describe("sinal negativo (opt-in por campo)", () => {
  it("alterna o sinal e preserva os dígitos", () => {
    const buf = digitar("150050");
    const neg = alternarSinal(buf);
    expect(neg).toBe("-150050");
    expect(formatarDigitos(neg)).toBe("-1.500,50");
    expect(digitosParaValor(neg)).toBe(-1500.5);
    expect(alternarSinal(neg)).toBe("150050");
  });

  it("aceita o menos antes do primeiro dígito", () => {
    let buf = alternarSinal("");
    expect(formatarDigitos(buf)).toBe("-"); // ainda sem valor
    expect(digitosParaValor(buf)).toBeNull();
    buf = digitar("500", buf);
    expect(formatarDigitos(buf)).toBe("-5,00");
    expect(digitosParaValor(buf)).toBe(-5);
  });

  it("hidrata valor negativo do banco em reais", () => {
    expect(formatarDigitos(valorParaDigitos(-1400))).toBe("-1.400,00");
    expect(formatarDigitos(valorParaDigitos(-0.05))).toBe("-0,05");
    expect(digitosParaValor(valorParaDigitos(-1500.5))).toBe(-1500.5);
  });

  it("backspace mantém o sinal e o descarta com o último dígito", () => {
    const buf = alternarSinal(digitar("150050"));
    const um = apagarDigito(buf);
    expect(formatarDigitos(um)).toBe("-150,05");
    expect(apagarDigito(alternarSinal(digitar("5")))).toBe("");
  });

  it("respeita o limite de dígitos com sinal", () => {
    const buf = alternarSinal(digitar("9".repeat(MAX_DIGITOS_MOEDA + 5)));
    expect(buf).toBe("-" + "9".repeat(MAX_DIGITOS_MOEDA));
    expect(aplicarDigito(buf, "9")).toBe(buf);
  });

  it("cola valores negativos, inclusive em parênteses (contábil)", () => {
    expect(formatarDigitos(colarParaDigitos("-1.500,50") ?? "")).toBe("-1.500,50");
    expect(formatarDigitos(colarParaDigitos("-R$ 1.400") ?? "")).toBe("-1.400,00");
    expect(formatarDigitos(colarParaDigitos("(1.500,50)") ?? "")).toBe("-1.500,50");
    expect(formatarDigitos(colarParaDigitos("-150050") ?? "")).toBe("-1.500,50");
    expect(colarParaDigitos("-")).toBeNull();
  });
});
