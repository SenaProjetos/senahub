import { describe, expect, it } from "vitest";
import {
  angulo,
  areaPoligono,
  distancia,
  formatarAngulo,
  formatarArea,
  formatarMetros,
  type Ponto3D,
} from "@/modules/coordenacao/medicao";

describe("distancia", () => {
  it("eixo único", () => {
    expect(distancia([0, 0, 0], [3, 0, 0])).toBe(3);
  });

  it("3D (Pitágoras 3-4-5 estendido)", () => {
    expect(distancia([0, 0, 0], [2, 3, 6])).toBe(7); // sqrt(4+9+36)=sqrt(49)=7
  });

  it("pontos coincidentes → 0", () => {
    expect(distancia([1, 1, 1], [1, 1, 1])).toBe(0);
  });
});

describe("angulo", () => {
  it("ângulo reto (90°)", () => {
    const a: Ponto3D = [1, 0, 0];
    const b: Ponto3D = [0, 0, 0];
    const c: Ponto3D = [0, 1, 0];
    expect(angulo(a, b, c)).toBeCloseTo(90, 6);
  });

  it("ângulo raso (180°) — pontos opostos", () => {
    expect(angulo([1, 0, 0], [0, 0, 0], [-1, 0, 0])).toBeCloseTo(180, 6);
  });

  it("ângulo nulo (0°) — mesmo lado", () => {
    expect(angulo([1, 0, 0], [0, 0, 0], [2, 0, 0])).toBeCloseTo(0, 6);
  });

  it("ângulo de 60° (triângulo equilátero)", () => {
    const b: Ponto3D = [0, 0, 0];
    const a: Ponto3D = [1, 0, 0];
    const c: Ponto3D = [0.5, Math.sqrt(3) / 2, 0];
    expect(angulo(a, b, c)).toBeCloseTo(60, 5);
  });

  it("vértice coincidente com um dos pontos → null (segmento de comprimento 0)", () => {
    expect(angulo([0, 0, 0], [0, 0, 0], [1, 0, 0])).toBeNull();
  });
});

describe("areaPoligono", () => {
  it("menos de 3 pontos → 0", () => {
    expect(areaPoligono([[0, 0, 0]])).toBe(0);
    expect(areaPoligono([[0, 0, 0], [1, 0, 0]])).toBe(0);
  });

  it("quadrado 2x2 no plano XY → área 4", () => {
    const quad: Ponto3D[] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [0, 2, 0],
    ];
    expect(areaPoligono(quad)).toBeCloseTo(4, 6);
  });

  it("triângulo retângulo 3x4 → área 6", () => {
    const tri: Ponto3D[] = [
      [0, 0, 0],
      [3, 0, 0],
      [0, 4, 0],
    ];
    expect(areaPoligono(tri)).toBeCloseTo(6, 6);
  });

  it("funciona em plano não-XY (área invariante à rotação)", () => {
    // Mesmo quadrado 2x2, mas no plano XZ em vez de XY.
    const quadXZ: Ponto3D[] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
      [0, 0, 2],
    ];
    expect(areaPoligono(quadXZ)).toBeCloseTo(4, 6);
  });

  it("pontos colineares → área ~0", () => {
    const colinear: Ponto3D[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];
    expect(areaPoligono(colinear)).toBeCloseTo(0, 6);
  });
});

describe("formatarMetros", () => {
  it("valores pequenos usam 3 casas", () => {
    expect(formatarMetros(0.1234)).toBe("0,123 m");
  });
  it("valores médios usam 2 casas", () => {
    expect(formatarMetros(5.678)).toBe("5,68 m");
  });
  it("valores grandes usam 1 casa", () => {
    expect(formatarMetros(123.45)).toBe("123,5 m");
  });
});

describe("formatarArea", () => {
  it("formata com vírgula e m²", () => {
    expect(formatarArea(4)).toBe("4,00 m²");
  });
});

describe("formatarAngulo", () => {
  it("formata com 1 casa e grau", () => {
    expect(formatarAngulo(90)).toBe("90,0°");
    expect(formatarAngulo(45.678)).toBe("45,7°");
  });
});
