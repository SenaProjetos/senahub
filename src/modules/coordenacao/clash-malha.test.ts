import { describe, expect, it } from "vitest";
import {
  refinarComponentesTriangulos,
  triangulosDaMalha,
  triangulosInterseccionam,
  type TrianguloClash,
} from "@/modules/coordenacao/clash-malha";

const identidade = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const semEspera = async () => {};

function triangulo(positions: number[], matriz = identidade) {
  return triangulosDaMalha({ positions, matriz })[0];
}

function deslocar(faces: readonly TrianguloClash[], dx: number, dy: number, dz: number): TrianguloClash[] {
  return faces.map((face) => ({
    ...face,
    vertices: face.vertices.map(
      (v) => [v[0] + dx, v[1] + dy, v[2] + dz] as [number, number, number],
    ) as [[number, number, number], [number, number, number], [number, number, number]],
    min: [face.min[0] + dx, face.min[1] + dy, face.min[2] + dz],
    max: [face.max[0] + dx, face.max[1] + dy, face.max[2] + dz],
  }));
}

function tetraedro(escala: number): TrianguloClash[] {
  const p = [
    [0, 0, 0],
    [escala, 0, 0],
    [0, escala, 0],
    [0, 0, escala],
  ];
  return [
    triangulo([...p[0], ...p[2], ...p[1]]),
    triangulo([...p[0], ...p[1], ...p[3]]),
    triangulo([...p[0], ...p[3], ...p[2]]),
    triangulo([...p[1], ...p[2], ...p[3]]),
  ];
}

describe("triangulosDaMalha", () => {
  it("respeita índices e transformação", () => {
    const r = triangulosDaMalha({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [2, 0, 1],
      matriz: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1],
    });
    expect(r).toHaveLength(1);
    expect(r[0].vertices).toEqual([
      [10, 21, 30],
      [10, 20, 30],
      [11, 20, 30],
    ]);
  });

  it("ignora triângulos degenerados", () => {
    expect(triangulosDaMalha({ positions: [0, 0, 0, 1, 0, 0, 2, 0, 0] })).toEqual([]);
  });
});

describe("triangulosInterseccionam", () => {
  it("confirma superfícies que se cruzam", () => {
    const horizontal = triangulo([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
    const vertical = triangulo([0, -0.5, -1, 0, -0.5, 1, 0, 0.8, 0]);
    expect(triangulosInterseccionam(horizontal, vertical)).toBe(true);
  });

  it("rejeita falso positivo de AABB entre triângulos coplanares separados", () => {
    const a = triangulo([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const b = triangulo([2, 2, 0, 2, 0.8, 0, 0.8, 2, 0]);
    expect(triangulosInterseccionam(a, b)).toBe(false);
  });

  it("rejeita planos paralelos separados", () => {
    const a = triangulo([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const b = triangulo([0, 0, 1, 2, 0, 1, 0, 2, 1]);
    expect(triangulosInterseccionam(a, b)).toBe(false);
  });
});

describe("refinarComponentesTriangulos", () => {
  it("encontra interseção em componentes com várias faces", async () => {
    const fora = triangulo([10, 10, 0, 11, 10, 0, 10, 11, 0]);
    const a = triangulo([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
    const b = triangulo([0, -0.5, -1, 0, -0.5, 1, 0, 0.8, 0]);
    const r = await refinarComponentesTriangulos([[fora, a]], [[b]], { cederControle: semEspera });
    expect(r.status).toBe("intersecta");
  });

  it("mantém conflito quando um sólido fechado está inteiramente dentro do outro", async () => {
    const externo = tetraedro(10);
    const interno = deslocar(tetraedro(1), 1, 1, 1);
    const r = await refinarComponentesTriangulos([interno], [externo], { cederControle: semEspera });
    expect(r.status).toBe("intersecta");
  });

  it("testa contenção em todos os MeshData, inclusive o segundo sólido", async () => {
    const externo = tetraedro(10);
    const primeiroFora = deslocar(tetraedro(1), 20, 20, 20);
    const segundoContido = deslocar(tetraedro(1), 1, 1, 1);
    const r = await refinarComponentesTriangulos(
      [primeiroFora, segundoContido],
      [externo],
      { cederControle: semEspera },
    );
    expect(r.status).toBe("intersecta");
  });

  it("usa BVH em vez do produto cartesiano para coleções grandes e distantes", async () => {
    const total = 2_000;
    const a = Array.from({ length: total }, (_, i) =>
      triangulo([i * 2, 0, 0, i * 2 + 0.5, 0, 0, i * 2, 0.5, 0]),
    );
    const b = Array.from({ length: total }, (_, i) =>
      triangulo([i * 2, 10, 0, i * 2 + 0.5, 10, 0, i * 2, 10.5, 0]),
    );
    const r = await refinarComponentesTriangulos([a], [b], {
      limiteOperacoes: 50_000,
      cederControle: semEspera,
    });
    expect(r.status).toBe("separada");
    expect(r.comparacoesTriangulos).toBe(0);
    expect(r.operacoes).toBeLessThan(total * 4);
  });

  it("cede controle e retorna inconclusivo no limite adversarial", async () => {
    const aBase = triangulo([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const bBase = triangulo([2, 2, 0, 2, 0.8, 0, 0.8, 2, 0]);
    const a = Array.from({ length: 300 }, () => aBase);
    const b = Array.from({ length: 300 }, () => bBase);
    let cessoes = 0;
    const r = await refinarComponentesTriangulos([a], [b], {
      limiteOperacoes: 100,
      operacoesPorFatia: 10,
      cederControle: async () => {
        cessoes += 1;
      },
    });
    expect(r.status).toBe("inconclusiva");
    expect(r.operacoes).toBe(101);
    expect(cessoes).toBeGreaterThan(0);
  });
});
