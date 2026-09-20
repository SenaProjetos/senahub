import { describe, expect, it } from "vitest";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  limitarZoom,
  rolagemParaAncora,
  zoomParaAjustar,
  zoomPelaRoda,
  zoomPorPasso,
} from "./zoom-visualizador";

describe("zoomPelaRoda", () => {
  it("roda para cima aproxima, para baixo afasta", () => {
    expect(zoomPelaRoda(1, -100)).toBeGreaterThan(1);
    expect(zoomPelaRoda(1, 100)).toBeLessThan(1);
  });

  it("é exponencial: aproximar e afastar o mesmo tanto volta ao ponto de partida", () => {
    const ida = zoomPelaRoda(0.7, -300);
    expect(zoomPelaRoda(ida, 300)).toBeCloseTo(0.7, 10);
  });

  it("nunca sai dos limites, por mais roda que se gire", () => {
    expect(zoomPelaRoda(1, -100000)).toBe(ZOOM_MAX);
    expect(zoomPelaRoda(1, 100000)).toBe(ZOOM_MIN);
  });
});

describe("zoomPorPasso / limitarZoom", () => {
  it("passo de 25% e volta", () => {
    expect(zoomPorPasso(1, 1)).toBe(1.25);
    expect(zoomPorPasso(1, -1)).toBe(0.8);
  });

  it("valor inválido cai em 100% em vez de propagar NaN", () => {
    expect(limitarZoom(NaN)).toBe(1);
    expect(limitarZoom(Infinity)).toBe(1);
  });
});

describe("zoomParaAjustar", () => {
  const a0 = { largura: 3179, altura: 4494 };

  it("largura: reduz a folha grande até caber na largura do visor", () => {
    expect(zoomParaAjustar("largura", { largura: 1000, altura: 700 }, a0)).toBeCloseTo(1000 / 3179, 6);
  });

  it("largura: documento pequeno não é ampliado além de 100%", () => {
    expect(zoomParaAjustar("largura", { largura: 2000, altura: 900 }, { largura: 794, altura: 1123 })).toBe(1);
  });

  it("página: usa o menor entre largura e altura, para a folha caber inteira", () => {
    // visor largo e baixo: a altura manda
    expect(zoomParaAjustar("pagina", { largura: 2000, altura: 500 }, a0)).toBeCloseTo(500 / 4494, 6);
    // visor estreito e alto: a largura manda
    expect(zoomParaAjustar("pagina", { largura: 400, altura: 3000 }, a0)).toBeCloseTo(400 / 3179, 6);
  });

  it("sem medida ainda (visor ou conteúdo zerado) devolve 100%, nunca 0 ou NaN", () => {
    expect(zoomParaAjustar("largura", { largura: 0, altura: 0 }, a0)).toBe(1);
    expect(zoomParaAjustar("pagina", { largura: 800, altura: 600 }, { largura: 0, altura: 0 })).toBe(1);
  });
});

describe("rolagemParaAncora", () => {
  it("o ponto do documento continua sob o cursor depois do zoom", () => {
    const cursor = 300; // px dentro do visor
    const rolagemAntes = 500;
    const zoomAntes = 0.5;
    const ponto = (rolagemAntes + cursor) / zoomAntes; // coordenada do documento sob o cursor
    const zoomDepois = 2;
    const rolagemDepois = rolagemParaAncora(ponto, zoomDepois, cursor);
    expect((rolagemDepois + cursor) / zoomDepois).toBeCloseTo(ponto, 10);
  });

  it("não devolve rolagem negativa (ponto perto da borda esquerda)", () => {
    expect(rolagemParaAncora(10, 1, 300)).toBe(0);
  });
});
