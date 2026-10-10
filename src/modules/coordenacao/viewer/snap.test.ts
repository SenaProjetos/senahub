import { describe, expect, it } from "vitest";
import { escolherSnap } from "@/modules/coordenacao/viewer/snap";
import type { Vec3 } from "@/modules/coordenacao/viewer/coords";

/** Projeção de brinquedo: 1 m = 100 px, olhando de cima (x, y). */
const naTela = (p: Vec3): [number, number] => [p[0] * 100, p[1] * 100];
const aresta = { p1: [0, 0, 0] as Vec3, p2: [4, 0, 0] as Vec3 };

describe("escolherSnap", () => {
  it("vértice ganha sempre", () => {
    expect(escolherSnap({ ponto: [4, 0, 0], classe: 0 }, naTela, [400, 0])).toEqual({ ponto: [4, 0, 0], tipo: "vertice" });
  });

  it("cursor perto do meio da aresta gruda no meio exato", () => {
    const r = escolherSnap({ ponto: [2.05, 0, 0], classe: 1, aresta }, naTela, [205, 3]);
    expect(r).toEqual({ ponto: [2, 0, 0], tipo: "meio" });
  });

  it("longe do meio, fica o ponto sobre a aresta", () => {
    const r = escolherSnap({ ponto: [3, 0, 0], classe: 1, aresta }, naTela, [300, 0]);
    expect(r).toEqual({ ponto: [3, 0, 0], tipo: "aresta" });
  });

  it("aresta sem extremos (o fragments não informou) fica no ponto", () => {
    expect(escolherSnap({ ponto: [1, 1, 0], classe: 1 }, naTela, [100, 100]).tipo).toBe("aresta");
  });
});
