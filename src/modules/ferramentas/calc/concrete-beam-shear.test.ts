import { describe, it, expect } from "vitest";
import { calcularCisalhamento, fctmMPa } from "./concrete-beam-shear";

describe("E01 — Cisalhamento (NBR 6118, Modelo I)", () => {
  it("fctm: C25 ≈ 2.565 MPa", () => {
    expect(fctmMPa(25)).toBeCloseTo(2.565, 2);
  });

  // Vetor hand-check: bw=20, d=46, fck=25, Vk=120, CA-50, γf=1.4.
  describe("viga bw=20 d=46 fck=25 Vk=120", () => {
    const r = calcularCisalhamento({ bw: 20, d: 46, fck: 25, Vk: 120 });

    it("VSd = 168 kN", () => expect(r.vsd).toBeCloseTo(168, 1));
    it("VRd2 ≈ 399 kN (biela ok)", () => {
      expect(r.vRd2).toBeCloseTo(399.2, 0);
      expect(r.situacao).toBe("ok");
    });
    it("Vc ≈ 70.8 kN", () => expect(r.vc).toBeCloseTo(70.8, 0));
    it("Asw/s ≈ 5.40 cm²/m", () => expect(r.aswS).toBeCloseTo(5.4, 1));
    it("Asw/s,mín ≈ 2.05 cm²/m", () => expect(r.aswSmin).toBeCloseTo(2.05, 1));
    it("s,máx = 27.6 cm (VSd ≤ 0.67·VRd2)", () => expect(r.sMax).toBeCloseTo(27.6, 1));
  });

  describe("cortante baixo → adota mínima", () => {
    const r = calcularCisalhamento({ bw: 20, d: 46, fck: 25, Vk: 30 });
    it("Asw/s adotada = mínima", () => {
      expect(r.aswSadotar).toBeCloseTo(r.aswSmin, 4);
      expect(r.alertas.some((a) => /m[íi]nima/i.test(a))).toBe(true);
    });
  });

  describe("biela rompe quando VSd > VRd2", () => {
    const r = calcularCisalhamento({ bw: 12, d: 30, fck: 20, Vk: 250 });
    it("situação revisar", () => {
      expect(r.vsd).toBeGreaterThan(r.vRd2);
      expect(r.situacao).toBe("revisar");
    });
  });
});
