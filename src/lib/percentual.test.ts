import { describe, expect, it } from "vitest";
import {
  DECIMAIS_PERCENTUAL_PADRAO,
  arredondar,
  formatarPercentual,
  limparEntradaPercentual,
  normalizarPercentual,
  parsePercentual,
} from "./percentual";

/** Simula a digitação tecla a tecla, com o filtro de entrada aplicado a cada tecla. */
function digitar(texto: string, decimais = DECIMAIS_PERCENTUAL_PADRAO, negativo = false): string {
  return [...texto].reduce((s, t) => limparEntradaPercentual(s + t, decimais, negativo), "");
}

describe("parsePercentual", () => {
  it("aceita vírgula e ponto como decimal", () => {
    expect(parsePercentual("25")).toBe(25);
    expect(parsePercentual("25,5")).toBe(25.5);
    expect(parsePercentual("25.5")).toBe(25.5);
    expect(parsePercentual("7,25")).toBe(7.25);
    expect(parsePercentual("0")).toBe(0);
  });

  it("digitar 25 significa 25%, não 0,25%", () => {
    expect(parsePercentual("25")).toBe(25);
    expect(parsePercentual("100")).toBe(100);
  });

  it("texto incompleto ainda não é número", () => {
    expect(parsePercentual("")).toBeNull();
    expect(parsePercentual(",")).toBeNull();
    expect(parsePercentual("-")).toBeNull();
    expect(parsePercentual("-,")).toBeNull();
    expect(parsePercentual("abc")).toBeNull();
    expect(parsePercentual("%")).toBeNull();
  });

  it("vazio é null, não zero", () => {
    expect(parsePercentual("")).toBeNull();
    expect(parsePercentual("0")).toBe(0);
  });

  it("lê o sinal negativo", () => {
    expect(parsePercentual("-5")).toBe(-5);
    expect(parsePercentual("-12,5")).toBe(-12.5);
  });

  it("ignora o símbolo e espaços", () => {
    expect(parsePercentual(" 25,5 % ")).toBe(25.5);
  });
});

describe("formatarPercentual", () => {
  it("não deixa zero final depois da vírgula", () => {
    expect(formatarPercentual(25)).toBe("25");
    expect(formatarPercentual(25.5)).toBe("25,5");
    expect(formatarPercentual(25.5, 3)).toBe("25,5");
    expect(formatarPercentual(7.25)).toBe("7,25");
    expect(formatarPercentual(0.1)).toBe("0,1");
    expect(formatarPercentual(0)).toBe("0");
  });

  it("preserva o zero de dentro do inteiro", () => {
    // Regressão: um regex ganancioso de zeros finais transformava "10" em "1".
    expect(formatarPercentual(10, 0)).toBe("10");
    expect(formatarPercentual(100, 0)).toBe("100");
    expect(formatarPercentual(100)).toBe("100");
    expect(formatarPercentual(10)).toBe("10");
    expect(formatarPercentual(20.5, 0)).toBe("21");
  });

  it("respeita as casas do campo", () => {
    expect(formatarPercentual(7.456, 3)).toBe("7,456");
    expect(formatarPercentual(7.456, 2)).toBe("7,46");
    expect(formatarPercentual(7.456, 0)).toBe("7");
    expect(formatarPercentual(33.5, 0)).toBe("34");
  });

  it("formata negativo", () => {
    expect(formatarPercentual(-12.5)).toBe("-12,5");
    expect(formatarPercentual(-0.001)).toBe("0"); // -0 nunca aparece
  });
});

describe("arredondar", () => {
  it("arredonda na casa pedida", () => {
    expect(arredondar(7.456, 2)).toBe(7.46);
    expect(arredondar(7.456, 0)).toBe(7);
    expect(arredondar(14.005, 3)).toBe(14.005);
  });
});

describe("limparEntradaPercentual (filtro em tempo real)", () => {
  it("deixa digitar o decimal em paz", () => {
    expect(digitar("25")).toBe("25");
    expect(digitar("25,")).toBe("25,");
    expect(digitar("25,5")).toBe("25,5");
    expect(parsePercentual(digitar("25,5"))).toBe(25.5);
  });

  it("ponto digitado vira vírgula", () => {
    expect(digitar("25.5")).toBe("25,5");
  });

  it("só uma vírgula", () => {
    expect(digitar("25,5,7")).toBe("25,57");
    expect(limparEntradaPercentual("2,5,7", 2)).toBe("2,57");
  });

  it("corta casas além do permitido", () => {
    expect(digitar("7,4567")).toBe("7,45");
    expect(digitar("7,4567", 3)).toBe("7,456");
  });

  it("decimais 0 bloqueia a vírgula", () => {
    expect(digitar("33,5", 0)).toBe("335");
    expect(limparEntradaPercentual("33,5", 0)).toBe("33");
  });

  it("descarta letras e o próprio %", () => {
    expect(digitar("2a5%")).toBe("25");
  });

  it("sinal só entra com opt-in, e só na frente", () => {
    expect(digitar("-5")).toBe("5");
    expect(digitar("-5", 2, true)).toBe("-5");
    expect(limparEntradaPercentual("5-3", 2, true)).toBe("53");
    expect(limparEntradaPercentual("-12,5", 2, true)).toBe("-12,5");
  });
});

describe("normalizarPercentual (no blur)", () => {
  it("arruma o que ficou pela metade", () => {
    expect(normalizarPercentual("25,")).toBe("25");
    expect(normalizarPercentual("25,50")).toBe("25,5");
    expect(normalizarPercentual("007")).toBe("7");
    expect(normalizarPercentual("0,0")).toBe("0");
  });

  it("texto sem número vira campo vazio, não 0", () => {
    expect(normalizarPercentual("")).toBe("");
    expect(normalizarPercentual(",")).toBe("");
    expect(normalizarPercentual("-")).toBe("");
  });

  it("respeita as casas do campo", () => {
    expect(normalizarPercentual("7,456", 2)).toBe("7,46");
    expect(normalizarPercentual("33,5", 0)).toBe("34");
  });
});
