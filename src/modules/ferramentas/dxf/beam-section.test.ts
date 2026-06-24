import { describe, it, expect } from "vitest";
import { desenharVigaSecao } from "./beam-section";
import { desenharDxf } from "./index";
import { selecionarBarras, areaBarra } from "../calc/bitolas";

describe("bitolas (NBR 7480)", () => {
  it("área da barra ø16 ≈ 2.011 cm²", () => {
    expect(areaBarra(16)).toBeCloseTo(2.011, 3);
  });
  it("seleciona ≥ 2 barras", () => {
    expect(selecionarBarras(0.5, 16).n).toBe(2);
  });
  it("cobre a área necessária", () => {
    const s = selecionarBarras(8, 16); // 8/2.011 = 3.98 → 4 barras
    expect(s.n).toBe(4);
    expect(s.asEf).toBeGreaterThanOrEqual(8);
  });
});

describe("DXF da viga (E01)", () => {
  it("retangular: contorno + estribo + barras + cotas", () => {
    const dxf = desenharVigaSecao({
      secao: { forma: "retangular", b: 20, h: 50 },
      d: 46,
      fck: 25,
      aco: "CA-50",
      Mk: 100,
    } as never).toString();
    expect(dxf).toContain("POLYLINE"); // contorno/estribo
    expect(dxf).toContain("CIRCLE"); // barras
    expect(dxf).toContain("ARMADURA");
    expect(dxf).toContain("ESTRIBO");
    expect(dxf).toContain("As ="); // legenda
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("dispatcher: E01 gera DXF; ferramenta sem desenho → null", () => {
    const dxf = desenharDxf("E01", { secao: { forma: "retangular", b: 20, h: 50 }, d: 46, fck: 25, aco: "CA-50", Mk: 100 });
    expect(dxf).toContain("EOF");
    expect(desenharDxf("U01", { dimensao: "forca", valor: 1, de: "kN", para: "N" })).toBeNull();
  });
});
