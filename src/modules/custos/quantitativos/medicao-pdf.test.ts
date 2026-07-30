import { describe, it, expect } from "vitest";
import { escalaPorReferencia, comprimentoPolilinha, areaPoligono } from "./medicao-pdf";

describe("escalaPorReferencia", () => {
  it("calcula unidade real por pixel", () => {
    expect(escalaPorReferencia(100, 5)).toBeCloseTo(0.05);
  });

  it("rejeita distância ou medida não positivas", () => {
    expect(() => escalaPorReferencia(0, 5)).toThrow();
    expect(() => escalaPorReferencia(100, 0)).toThrow();
    expect(() => escalaPorReferencia(-10, 5)).toThrow();
  });
});

describe("comprimentoPolilinha", () => {
  it("soma segmentos (triângulo 3-4-5) e converte pela escala", () => {
    const pontos = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
    expect(comprimentoPolilinha(pontos, 1)).toBeCloseTo(5);
    expect(comprimentoPolilinha(pontos, 2)).toBeCloseTo(10);
  });

  it("polilinha de um único ponto → 0", () => {
    expect(comprimentoPolilinha([{ x: 0, y: 0 }], 1)).toBe(0);
  });
});

describe("areaPoligono", () => {
  it("retângulo 10x5 pixels, escala 1 → área 50", () => {
    const pontos = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }];
    expect(areaPoligono(pontos, 1)).toBeCloseTo(50);
  });

  it("escala afeta a área ao quadrado (0.1 → área/100)", () => {
    const pontos = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }];
    expect(areaPoligono(pontos, 0.1)).toBeCloseTo(0.5);
  });

  it("triângulo base 4 altura 3 → área 6", () => {
    const pontos = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];
    expect(areaPoligono(pontos, 1)).toBeCloseTo(6);
  });

  it("menos de 3 pontos → 0", () => {
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1)).toBe(0);
  });
});
