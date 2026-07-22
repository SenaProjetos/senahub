import { describe, expect, it } from "vitest";
import { validarGeorref, rotacaoParaEixo, eixoParaRotacao, type GeorrefParams } from "@/modules/coordenacao/georref";

function params(over: Partial<GeorrefParams> = {}): GeorrefParams {
  return { crsName: "EPSG:31983", eastings: 300000, northings: 7400000, orthogonalHeight: 800, rotacaoGraus: 0, ...over };
}

describe("validarGeorref", () => {
  it("params válidos", () => {
    expect(validarGeorref(params())).toEqual({ ok: true });
  });
  it("CRS vazio → erro", () => {
    expect(validarGeorref(params({ crsName: "  " })).ok).toBe(false);
  });
  it("coordenada não-finita → erro", () => {
    expect(validarGeorref(params({ eastings: NaN })).ok).toBe(false);
    expect(validarGeorref(params({ northings: Infinity })).ok).toBe(false);
  });
  it("coordenada absurda → erro", () => {
    expect(validarGeorref(params({ eastings: 1e12 })).ok).toBe(false);
  });
  it("rotação não-finita → erro", () => {
    expect(validarGeorref(params({ rotacaoGraus: NaN })).ok).toBe(false);
  });
  it("escala inválida → erro; null é aceito", () => {
    expect(validarGeorref(params({ escala: 0 })).ok).toBe(false);
    expect(validarGeorref(params({ escala: -1 })).ok).toBe(false);
    expect(validarGeorref(params({ escala: null })).ok).toBe(true);
    expect(validarGeorref(params({ escala: 0.9996 })).ok).toBe(true);
  });
});

describe("rotacaoParaEixo", () => {
  it("0° → (1, 0)", () => {
    expect(rotacaoParaEixo(0)).toEqual({ abscissa: 1, ordinate: 0 });
  });
  it("90° → (0, 1)", () => {
    const r = rotacaoParaEixo(90);
    expect(r.abscissa).toBeCloseTo(0, 12);
    expect(r.ordinate).toBeCloseTo(1, 12);
  });
  it("180° → (-1, 0) sem -0 no ordinate", () => {
    const r = rotacaoParaEixo(180);
    expect(r.abscissa).toBeCloseTo(-1, 12);
    expect(Object.is(r.ordinate, -0)).toBe(false);
  });
});

describe("eixoParaRotacao", () => {
  it("(1,0) → 0°", () => {
    expect(eixoParaRotacao(1, 0)).toBeCloseTo(0, 12);
  });
  it("(0,1) → 90°", () => {
    expect(eixoParaRotacao(0, 1)).toBeCloseTo(90, 12);
  });
  it("null/null → 0 (sem rotação declarada)", () => {
    expect(eixoParaRotacao(null, null)).toBe(0);
  });
  it("ambos ~0 → null (indefinido)", () => {
    expect(eixoParaRotacao(0, 0)).toBeNull();
  });
  it("round-trip com rotacaoParaEixo", () => {
    for (const g of [0, 30, 45, 90, 135, -45, -90]) {
      const { abscissa, ordinate } = rotacaoParaEixo(g);
      expect(eixoParaRotacao(abscissa, ordinate)).toBeCloseTo(g, 10);
    }
  });
});
