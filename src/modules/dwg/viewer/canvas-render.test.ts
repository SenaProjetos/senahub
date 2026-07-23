import { describe, it, expect } from "vitest";
import { bbox, ajustarParaVisualizar, mundoParaTela, telaParaMundo, aplicarZoom, aplicarPan } from "@/modules/dwg/viewer/canvas-render";
import type { Primitiva } from "@/modules/dwg/parse";

describe("bbox", () => {
  it("null para cena vazia", () => {
    expect(bbox([])).toBeNull();
  });

  it("linha", () => {
    const p: Primitiva[] = [{ tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 10, y: 5 }, camada: "0" }];
    expect(bbox(p)).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 5 });
  });

  it("circulo (bbox do quadrado circunscrito)", () => {
    const p: Primitiva[] = [{ tipo: "circulo", centro: { x: 10, y: 10 }, raio: 3, camada: "0" }];
    expect(bbox(p)).toEqual({ minX: 7, maxX: 13, minY: 7, maxY: 13 });
  });

  it("arco (aproxima pelo círculo completo)", () => {
    const p: Primitiva[] = [{ tipo: "arco", centro: { x: 0, y: 0 }, raio: 5, a0: 0, a1: 90, camada: "0" }];
    expect(bbox(p)).toEqual({ minX: -5, maxX: 5, minY: -5, maxY: 5 });
  });

  it("polilinha", () => {
    const p: Primitiva[] = [
      { tipo: "polilinha", pontos: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }], fechada: true, camada: "0" },
    ];
    expect(bbox(p)).toEqual({ minX: 0, maxX: 20, minY: 0, maxY: 10 });
  });

  it("texto (largura aproximada por nº de caracteres)", () => {
    const p: Primitiva[] = [{ tipo: "texto", p: { x: 0, y: 0 }, altura: 10, conteudo: "AB", rotacao: 0, camada: "0" }];
    // largura aprox = 10 * 0.6 * 2 = 12
    expect(bbox(p)).toEqual({ minX: 0, maxX: 12, minY: 0, maxY: 10 });
  });

  it("combina min/max de primitivas mistas", () => {
    const p: Primitiva[] = [
      { tipo: "linha", p1: { x: -5, y: 0 }, p2: { x: 0, y: 0 }, camada: "0" },
      { tipo: "circulo", centro: { x: 100, y: 100 }, raio: 1, camada: "0" },
    ];
    expect(bbox(p)).toEqual({ minX: -5, maxX: 101, minY: 0, maxY: 101 });
  });
});

describe("ajustarParaVisualizar", () => {
  it("centraliza o bbox no viewport e escala pelo menor eixo", () => {
    // Mundo 100x50 (2:1), viewport 400x400 sem margem → escala limitada pela altura (300/50=6) vs largura (300/100=3) → 3
    const caixa = { minX: 0, maxX: 100, minY: 0, maxY: 50 };
    const t = ajustarParaVisualizar(caixa, 400, 400, 50);
    expect(t.escala).toBeCloseTo(3, 6);
    // Centro do mundo (50,25) deve cair no centro da tela (200,200)
    const centroTela = mundoParaTela({ x: 50, y: 25 }, t);
    expect(centroTela.x).toBeCloseTo(200, 6);
    expect(centroTela.y).toBeCloseTo(200, 6);
  });

  it("inverte Y (mundo pra cima vira tela pra baixo)", () => {
    const caixa = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const t = ajustarParaVisualizar(caixa, 100, 100, 0);
    const topo = mundoParaTela({ x: 0, y: 10 }, t); // topo do mundo (Y alto)
    const base = mundoParaTela({ x: 0, y: 0 }, t); // base do mundo (Y baixo)
    expect(topo.y).toBeLessThan(base.y); // topo do mundo fica mais acima na tela (Y menor)
  });
});

describe("mundoParaTela / telaParaMundo", () => {
  it("são inversas uma da outra", () => {
    const t = { escala: 2.5, offsetX: 30, offsetY: 40 };
    const original = { x: 12.3, y: -7.8 };
    const tela = mundoParaTela(original, t);
    const voltaAoMundo = telaParaMundo(tela, t);
    expect(voltaAoMundo.x).toBeCloseTo(original.x, 9);
    expect(voltaAoMundo.y).toBeCloseTo(original.y, 9);
  });
});

describe("aplicarZoom", () => {
  it("mantém o ponto-pivô fixo na tela", () => {
    const t = { escala: 1, offsetX: 0, offsetY: 0 };
    const pivot = { x: 100, y: 100 };
    // Mundo sob o pivô antes do zoom
    const mundoNoPivotAntes = telaParaMundo(pivot, t);
    const t2 = aplicarZoom(t, 2, pivot);
    // O mesmo ponto do mundo deve mapear de volta pro mesmo pixel do pivô
    const pivotDepois = mundoParaTela(mundoNoPivotAntes, t2);
    expect(pivotDepois.x).toBeCloseTo(pivot.x, 9);
    expect(pivotDepois.y).toBeCloseTo(pivot.y, 9);
    expect(t2.escala).toBe(2);
  });
});

describe("aplicarPan", () => {
  it("desloca só o offset, escala inalterada", () => {
    const t = { escala: 1.5, offsetX: 10, offsetY: 20 };
    const t2 = aplicarPan(t, 5, -3);
    expect(t2).toEqual({ escala: 1.5, offsetX: 15, offsetY: 17 });
  });

  it("um ponto do mundo se desloca exatamente pelo delta em pixels", () => {
    const t = { escala: 2, offsetX: 0, offsetY: 0 };
    const mundo = { x: 3, y: 4 };
    const antes = mundoParaTela(mundo, t);
    const t2 = aplicarPan(t, 10, -5);
    const depois = mundoParaTela(mundo, t2);
    expect(depois.x - antes.x).toBeCloseTo(10, 9);
    expect(depois.y - antes.y).toBeCloseTo(-5, 9);
  });
});
