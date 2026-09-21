import { describe, expect, it } from "vitest";
import { diasComExtenso, extensoInteiro, extensoMoeda, quantidadeComExtenso } from "./extenso";

describe("extensoInteiro", () => {
  it.each([
    [0, "zero"],
    [1, "um"],
    [10, "dez"],
    [15, "quinze"],
    [21, "vinte e um"],
    [45, "quarenta e cinco"],
    [99, "noventa e nove"],
    [100, "cem"],
    [101, "cento e um"],
    [110, "cento e dez"],
    [200, "duzentos"],
    [999, "novecentos e noventa e nove"],
    [1000, "mil"],
    [1001, "mil e um"],
    [1100, "mil e cem"],
    [1980, "mil novecentos e oitenta"],
    [2000, "dois mil"],
    [2050, "dois mil e cinquenta"],
    [2805, "dois mil oitocentos e cinco"],
    [3500, "três mil e quinhentos"],
    [12500, "doze mil e quinhentos"],
    [22000, "vinte e dois mil"],
    [100000, "cem mil"],
    [101000, "cento e um mil"],
    [105000, "cento e cinco mil"],
    [1_000_000, "um milhão"],
    [1_000_001, "um milhão e um"],
    [1_001_000, "um milhão e mil"],
    [1_200_000, "um milhão e duzentos mil"],
    [1_250_000, "um milhão duzentos e cinquenta mil"],
    [2_000_000, "dois milhões"],
    [1_234_567, "um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete"],
    [1_000_000_000, "um bilhão"],
    [999_999_999_999, "novecentos e noventa e nove bilhões novecentos e noventa e nove milhões novecentos e noventa e nove mil novecentos e noventa e nove"],
  ])("%i → %s", (n, esperado) => {
    expect(extensoInteiro(n)).toBe(esperado);
  });

  it("feminino concorda um/dois e as centenas, mas não os milhões", () => {
    expect(extensoInteiro(1, { feminino: true })).toBe("uma");
    expect(extensoInteiro(2, { feminino: true })).toBe("duas");
    expect(extensoInteiro(21, { feminino: true })).toBe("vinte e uma");
    expect(extensoInteiro(200, { feminino: true })).toBe("duzentas");
    expect(extensoInteiro(2000, { feminino: true })).toBe("duas mil");
    expect(extensoInteiro(2_000_000, { feminino: true })).toBe("dois milhões");
    // 3 e 4 não têm forma feminina
    expect(extensoInteiro(3, { feminino: true })).toBe("três");
  });

  it("recusa o que não sabe escrever em vez de inventar", () => {
    expect(() => extensoInteiro(-1)).toThrow(RangeError);
    expect(() => extensoInteiro(1.5)).toThrow(RangeError);
    expect(() => extensoInteiro(NaN)).toThrow(RangeError);
    expect(() => extensoInteiro(1_000_000_000_000)).toThrow(RangeError);
  });

  /**
   * Prova independente: um leitor de extenso escrito à parte devolve o número de origem. Se a
   * regra do "e" ou de uma classe estiver errada, o texto ainda "parece" português mas não volta
   * ao mesmo número — os exemplos fixos acima não pegariam isso nos milhares de casos restantes.
   */
  it("ida e volta: ler o extenso devolve o número, de 0 a 20.000 e em amostras grandes", () => {
    const VALOR: Record<string, number> = {
      zero: 0, um: 1, uma: 1, dois: 2, duas: 2, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
      nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15, dezesseis: 16,
      dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
      sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200,
      duzentas: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
      setecentos: 700, oitocentos: 800, novecentos: 900,
    };
    const ESCALA: Record<string, number> = { mil: 1e3, milhão: 1e6, milhões: 1e6, bilhão: 1e9, bilhões: 1e9 };
    function ler(texto: string): number {
      let total = 0;
      let grupo = 0;
      for (const p of texto.split(" ")) {
        if (p === "e" || p === "de") continue;
        if (p in ESCALA) {
          total += (grupo === 0 ? 1 : grupo) * ESCALA[p]; // "mil" sozinho vale 1 mil
          grupo = 0;
        } else if (p in VALOR) grupo += VALOR[p];
        else throw new Error(`palavra desconhecida: ${p} em "${texto}"`);
      }
      return total + grupo;
    }

    for (let n = 0; n <= 20_000; n++) expect(ler(extensoInteiro(n))).toBe(n);
    let semente = 12345;
    for (let i = 0; i < 5000; i++) {
      semente = (semente * 1103515245 + 12345) % 2_147_483_648;
      const n = semente % 1_000_000_000_000;
      expect(ler(extensoInteiro(n))).toBe(n);
    }
  });
});

describe("extensoMoeda", () => {
  it.each([
    [0, "zero real"],
    [1, "um real"],
    [2, "dois reais"],
    [0.01, "um centavo"],
    [0.5, "cinquenta centavos"],
    [1.01, "um real e um centavo"],
    [12500, "doze mil e quinhentos reais"],
    [1050.25, "mil e cinquenta reais e vinte e cinco centavos"],
    // os valores que estavam errados nas propostas reais
    [1980, "mil novecentos e oitenta reais"],
    [2805, "dois mil oitocentos e cinco reais"],
    [105000, "cento e cinco mil reais"],
    [22000, "vinte e dois mil reais"],
    [3500, "três mil e quinhentos reais"],
    [5500, "cinco mil e quinhentos reais"],
    [26000, "vinte e seis mil reais"],
    // redondo em milhão/bilhão pede "de reais"
    [1_000_000, "um milhão de reais"],
    [3_000_000, "três milhões de reais"],
    [1_000_000_000, "um bilhão de reais"],
    [1_000_000.5, "um milhão de reais e cinquenta centavos"],
    [1_200_000, "um milhão e duzentos mil reais"],
  ])("%d → %s", (valor, esperado) => {
    expect(extensoMoeda(valor)).toBe(esperado);
  });

  it("ruído de ponto flutuante não vira centavo espúrio", () => {
    expect(extensoMoeda(0.1 + 0.2)).toBe("trinta centavos"); // 0.30000000000000004
    expect(extensoMoeda(1.15)).toBe("um real e quinze centavos"); // 1.15 * 100 = 114.99999…
  });

  it("recusa valor negativo, não numérico ou acima do limite", () => {
    expect(() => extensoMoeda(-1)).toThrow(RangeError);
    expect(() => extensoMoeda(NaN)).toThrow(RangeError);
    expect(() => extensoMoeda(Infinity)).toThrow(RangeError);
    expect(() => extensoMoeda(1e15)).toThrow(RangeError);
  });
});

describe("quantidade com extenso", () => {
  it("prazo em dias, singular e plural", () => {
    expect(diasComExtenso(45)).toBe("45 (quarenta e cinco) dias");
    expect(diasComExtenso(1)).toBe("1 (um) dia");
    expect(diasComExtenso(30)).toBe("30 (trinta) dias");
  });

  it("substantivo feminino concorda", () => {
    const parcelas = { singular: "parcela", plural: "parcelas", feminino: true };
    expect(quantidadeComExtenso(2, parcelas)).toBe("2 (duas) parcelas");
    expect(quantidadeComExtenso(1, parcelas)).toBe("1 (uma) parcela");
  });
});
