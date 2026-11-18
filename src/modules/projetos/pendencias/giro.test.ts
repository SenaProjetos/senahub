import { describe, expect, it } from "vitest";
import { paraVisual } from "./carimbo/coords";
import { desgirarPonto, girarPonto, girarVetor, giroNaTela, trocaEixos, type Giro } from "./giro";

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

describe("giro na tela = /Rotate do PDF + giro de leitura", () => {
  it.each([
    [0, 0, 0],
    [270, 0, 270],
    [270, 90, 0],
    [90, 180, 270],
    [180, 270, 90],
    [-90, 0, 270],
    [450, 0, 90],
  ] as const)("/Rotate %i com giro %i abre a %i°", (rotatePdf, giro, esperado) => {
    expect(giroNaTela(rotatePdf, giro)).toBe(esperado);
  });

  it("sem /Rotate (página sem a chave) vale o giro de leitura", () => {
    expect(giroNaTela(undefined, 90)).toBe(90);
  });

  // `girarPonto` leva o espaço SEM rotação nenhuma ao espaço do `/Rotate`: tem de bater com o mapeamento do carimbo, que
  // foi conferido numa prancha real `/Rotate 270` (`carimbo/coords.ts`).
  it.each([90, 180, 270] as const)("bate com o carimbo: ponto do PDF na página sem rotação → com /Rotate %i", (rot) => {
    const W = 2401;
    const H = 3387;
    for (const p of [
      { x: 100, y: 200 },
      { x: 2300, y: 50 },
      { x: 1200, y: 3000 },
    ]) {
      const sem = paraVisual(p, W, H, 0);
      const com = paraVisual(p, W, H, rot);
      const r = girarPonto(sem.u, sem.v, rot);
      expect(r.u).toBeCloseTo(com.u, 10);
      expect(r.v).toBeCloseTo(com.v, 10);
    }
  });

  it.each(GIROS)("girar um deslocamento em %i° é a diferença dos dois pontos girados", (giro) => {
    const a = { x: 0.31, y: 0.62 };
    const d = { dx: 0.05, dy: -0.12 };
    const pa = girarPonto(a.x, a.y, giro);
    const pb = girarPonto(a.x + d.dx, a.y + d.dy, giro);
    const v = girarVetor(d.dx, d.dy, giro);
    expect(v.dx).toBeCloseTo(pb.u - pa.u, 12);
    expect(v.dy).toBeCloseTo(pb.v - pa.v, 12);
  });
});
