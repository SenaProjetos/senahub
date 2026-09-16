import { describe, expect, it } from "vitest";
import { classificarTamanhoPapel } from "./tamanho-papel";

const MM_PARA_PT = 72 / 25.4;
const pt = (mm: number) => mm * MM_PARA_PT;

describe("classificarTamanhoPapel", () => {
  it("casa cada tamanho ISO 216 em retrato", () => {
    expect(classificarTamanhoPapel(pt(841), pt(1189))).toBe("A0");
    expect(classificarTamanhoPapel(pt(594), pt(841))).toBe("A1");
    expect(classificarTamanhoPapel(pt(420), pt(594))).toBe("A2");
    expect(classificarTamanhoPapel(pt(297), pt(420))).toBe("A3");
    expect(classificarTamanhoPapel(pt(210), pt(297))).toBe("A4");
  });

  it("paisagem casa igual — orientação não importa", () => {
    expect(classificarTamanhoPapel(pt(1189), pt(841))).toBe("A0");
    expect(classificarTamanhoPapel(pt(420), pt(297))).toBe("A3");
  });

  it("tolera arredondamento pequeno do driver de plotagem", () => {
    expect(classificarTamanhoPapel(pt(297.3), pt(419.6))).toBe("A3");
  });

  it("fora de qualquer faixa não inventa o mais próximo", () => {
    expect(classificarTamanhoPapel(pt(250), pt(350))).toBeNull();
    expect(classificarTamanhoPapel(pt(216), pt(279))).toBeNull(); // Carta (Letter), não é A4
  });

  it("dimensão inválida (zero/negativa) não estoura, devolve null", () => {
    expect(classificarTamanhoPapel(0, pt(297))).toBeNull();
    expect(classificarTamanhoPapel(-10, pt(297))).toBeNull();
  });
});
