import { describe, expect, it } from "vitest";
import {
  DEGRAUS_ZOOM,
  ZOOM_PREDEFINIDOS,
  escalaDoCanvas,
  limitarZoomPdf,
  MAX_PIXELS_DETALHE,
  MAX_PIXELS_PAGINA,
  passoZoom,
  precisaDetalhe,
  regiaoDetalhe,
  ZOOM_PDF_MAX,
  ZOOM_PDF_MIN,
  zoomPelaRodaPdf,
} from "./pdf-zoom";

describe("limites e passos", () => {
  it("o teto passou de 500% para 2000%", () => {
    expect(ZOOM_PDF_MAX).toBe(20);
    expect(limitarZoomPdf(50)).toBe(20);
    expect(limitarZoomPdf(0.1)).toBe(ZOOM_PDF_MIN);
    expect(limitarZoomPdf(Number.NaN)).toBe(1);
  });

  it("botões andam de degrau em degrau e param nos limites", () => {
    expect(passoZoom(1, 1)).toBe(1.25);
    expect(passoZoom(5, 1)).toBe(6);
    expect(passoZoom(16, 1)).toBe(20);
    expect(passoZoom(20, 1)).toBe(20);
    expect(passoZoom(1, -1)).toBe(0.75);
    expect(passoZoom(0.5, -1)).toBe(0.5);
  });

  it("zoom entre degraus (roda, pinça) vai para o degrau seguinte, não pula um", () => {
    expect(passoZoom(5.4, 1)).toBe(6);
    expect(passoZoom(5.4, -1)).toBe(5);
  });

  it("de 500% a 2000% em 6 cliques", () => {
    let z = 5;
    let cliques = 0;
    while (z < ZOOM_PDF_MAX) {
      z = passoZoom(z, 1);
      cliques++;
    }
    expect(cliques).toBe(6);
    expect(DEGRAUS_ZOOM.at(-1)).toBe(ZOOM_PDF_MAX);
  });

  it("roda é multiplicativa: sobe e desce volta ao mesmo zoom", () => {
    const subiu = zoomPelaRodaPdf(3, -100);
    expect(subiu).toBeCloseTo(3.6, 3);
    expect(zoomPelaRodaPdf(subiu, 100)).toBeCloseTo(3, 2);
    expect(zoomPelaRodaPdf(20, -100)).toBe(20);
  });
});

describe("escalaDoCanvas", () => {
  it("cabe no orçamento: usa a densidade da tela", () => {
    expect(escalaDoCanvas(1000, 700, 2, MAX_PIXELS_PAGINA)).toBe(2);
  });

  it("passa do orçamento: desce até caber e pede o detalhe", () => {
    // Prancha A1 a 2000% numa coluna de 1100 px: 22000 × 15554 px CSS.
    const e = escalaDoCanvas(22000, 15554, 2, MAX_PIXELS_PAGINA);
    expect(22000 * e * 15554 * e).toBeLessThanOrEqual(MAX_PIXELS_PAGINA * 1.0001);
    expect(precisaDetalhe(e, 2)).toBe(true);
    expect(precisaDetalhe(2, 2)).toBe(false);
  });
});

describe("regiaoDetalhe", () => {
  const visor = { left: 300, top: 100, width: 1000, height: 700 };

  it("página fora do visor não pede detalhe", () => {
    expect(regiaoDetalhe({ pagina: { left: 300, top: 900, width: 5000, height: 3000 }, visor, dpr: 1, maxPixels: MAX_PIXELS_DETALHE })).toBeNull();
  });

  it("trecho visível + folga, em px da página, recortado à página", () => {
    // Página rolada: começa 2000 px à esquerda e 1000 px acima do visor.
    const r = regiaoDetalhe({
      pagina: { left: -1700, top: -900, width: 20000, height: 14000 },
      visor,
      dpr: 1,
      maxPixels: MAX_PIXELS_DETALHE,
      folga: 0.25,
    })!;
    // Visível: x 2000..3000, y 1000..1700; folga = 250 px.
    expect(r).toMatchObject({ x: 1750, y: 750, w: 1500, h: 1200, escala: 1 });
  });

  it("folga não sai da página", () => {
    const r = regiaoDetalhe({ pagina: { left: 300, top: 100, width: 3000, height: 2000 }, visor, dpr: 1, maxPixels: MAX_PIXELS_DETALHE })!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("encolhe a folga para caber no orçamento de pixels", () => {
    const r = regiaoDetalhe({
      pagina: { left: -5000, top: -5000, width: 40000, height: 30000 },
      visor: { left: 0, top: 0, width: 1900, height: 1000 },
      dpr: 2,
      maxPixels: 8_000_000,
    })!;
    expect(r.w * r.h * r.escala * r.escala).toBeLessThanOrEqual(8_000_000 * 1.0001);
    expect(r.w).toBeGreaterThanOrEqual(1900);
  });
});

describe("ZOOM_PREDEFINIDOS", () => {
  it("vão do mínimo ao máximo, em ordem, passando por 100%", () => {
    expect(ZOOM_PREDEFINIDOS[0]).toBe(ZOOM_PDF_MIN);
    expect(ZOOM_PREDEFINIDOS.at(-1)).toBe(ZOOM_PDF_MAX);
    expect(ZOOM_PREDEFINIDOS).toContain(1);
    expect([...ZOOM_PREDEFINIDOS].sort((a, b) => a - b)).toEqual([...ZOOM_PREDEFINIDOS]);
    for (const z of ZOOM_PREDEFINIDOS) expect(limitarZoomPdf(z)).toBe(z);
  });
});
