import { describe, expect, it } from "vitest";
import { cruzamentos, gradeDeCruzamentos, regiaoParaMundo } from "./cruzamentos";

const L = 64;
const A = 48;

/** Máscara L×A com 1 no retângulo [x0, x1) × [y0, y1). */
function retangulo(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(L * A);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * L + x] = 1;
  return m;
}

describe("gradeDeCruzamentos", () => {
  it("marca o ladrilho com tinta nas duas máscaras", () => {
    const { grade, cols, rows } = gradeDeCruzamentos(retangulo(0, 0, 16, 16), retangulo(0, 0, 16, 16), L, A);
    expect(cols).toBe(4);
    expect(rows).toBe(3);
    expect(grade[0]).toBe(1);
    expect([...grade].filter(Boolean)).toHaveLength(1);
  });
  it("tinta só numa das máscaras não marca nada", () => {
    const { grade } = gradeDeCruzamentos(retangulo(0, 0, 16, 16), retangulo(32, 32, 48, 48), L, A);
    expect([...grade].some(Boolean)).toBe(false);
  });
});

describe("cruzamentos", () => {
  it("duas máscaras sem sobreposição → nenhuma região", () => {
    expect(cruzamentos(retangulo(0, 0, 10, 10), retangulo(40, 30, 60, 45), L, A)).toEqual([]);
  });

  it("um quadrado 20×20 nas duas → 1 região que o cobre", () => {
    const q = retangulo(20, 10, 40, 30);
    const r = cruzamentos(q, q, L, A);
    expect(r).toHaveLength(1);
    const [g] = r;
    expect(g.x).toBeLessThanOrEqual(20);
    expect(g.y).toBeLessThanOrEqual(10);
    expect(g.x + g.largura).toBeGreaterThanOrEqual(40);
    expect(g.y + g.altura).toBeGreaterThanOrEqual(30);
  });

  it("3 pixels em comum com mínimo 4 → nada", () => {
    const a = new Uint8Array(L * A);
    const b = new Uint8Array(L * A);
    for (const p of [0, 1, 2]) {
      a[p] = 1;
      b[p] = 1;
    }
    expect(cruzamentos(a, b, L, A, 16, 4)).toEqual([]);
    a[3] = 1;
    b[3] = 1;
    expect(cruzamentos(a, b, L, A, 16, 4)).toHaveLength(1);
  });
});

describe("regiaoParaMundo", () => {
  it("px do canvas (com densidade) → caixa no mundo pela vista", () => {
    // vista: mundo × 2 + (10, 20) em px CSS; densidade 2 → px do canvas = CSS × 2.
    const vista = { tx: 10, ty: 20, giro: 0, escala: 2 };
    const caixa = regiaoParaMundo({ x: 40, y: 80, largura: 32, altura: 16 }, vista, 2);
    expect(caixa).toEqual({ minX: 5, minY: 10, maxX: 13, maxY: 14 });
  });
});
