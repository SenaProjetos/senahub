import { describe, expect, it } from "vitest";
import { desgirarPonto, girarPonto, trocaEixos, type Giro } from "./giro";

const GIROS: Giro[] = [0, 90, 180, 270];

describe("giro da prancha", () => {
  it("0° não mexe no ponto", () => {
    expect(desgirarPonto(0.2, 0.7, 0)).toEqual({ x: 0.2, y: 0.7 });
  });

  // Canto superior esquerdo da página: girando 90° no sentido horário ele vai para o canto
  // superior DIREITO da tela; 180°, inferior direito; 270°, inferior esquerdo.
  it.each([
    [90, { u: 1, v: 0 }],
    [180, { u: 1, v: 1 }],
    [270, { u: 0, v: 1 }],
  ] as const)("canto superior esquerdo com %i° vai para o canto certo da tela", (giro, esperado) => {
    expect(girarPonto(0, 0, giro)).toEqual(esperado);
    expect(desgirarPonto(esperado.u, esperado.v, giro)).toEqual({ x: 0, y: 0 });
  });

  it("clicar no topo-centro da tela girada 90° aponta para o meio da borda esquerda da página", () => {
    expect(desgirarPonto(0.5, 0, 90)).toEqual({ x: 0, y: 0.5 });
  });

  it.each(GIROS)("desgirar desfaz girar em %i°", (giro) => {
    const { u, v } = girarPonto(0.13, 0.81, giro);
    const p = desgirarPonto(u, v, giro);
    expect(p.x).toBeCloseTo(0.13);
    expect(p.y).toBeCloseTo(0.81);
  });

  it("só 90° e 270° trocam os eixos", () => {
    expect(GIROS.map(trocaEixos)).toEqual([false, true, false, true]);
  });
});
