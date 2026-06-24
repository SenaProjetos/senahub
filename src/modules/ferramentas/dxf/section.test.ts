import { describe, it, expect } from "vitest";
import { desenharSecao } from "./section";
import { calcular } from "../calc/section-properties";

describe("DXF da seção (U02)", () => {
  it("retângulo: contorno em polilinha fechada + cotas + eixos", () => {
    const r = calcular({ tipo: "retangular", b: 20, h: 50 });
    const dxf = desenharSecao(r).toString();
    expect(dxf).toContain("POLYLINE");
    expect(dxf).toContain("SECAO");
    expect(dxf).toContain("EIXOS");
    expect(dxf).toContain("COTAS");
    // largura/altura rotuladas em cm
    expect(dxf).toContain("20.0 cm");
    expect(dxf).toContain("50.0 cm");
    // termina como DXF válido
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("círculo: usa entidade CIRCLE", () => {
    const r = calcular({ tipo: "circular", d: 40 });
    const dxf = desenharSecao(r).toString();
    expect(dxf).toContain("CIRCLE");
    expect(dxf).toContain("40.0 cm");
  });

  it("T: contorno poligonal e camada SECAO", () => {
    const r = calcular({ tipo: "T", bf: 30, hf: 10, bw: 15, hw: 40 });
    const dxf = desenharSecao(r).toString();
    expect(dxf).toContain("POLYLINE");
    // altura total = hw+hf = 50 cm
    expect(dxf).toContain("50.0 cm");
  });
});
