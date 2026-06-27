import { describe, it, expect } from "vitest";
import { calcularFlecha, moduloSecante } from "./concrete-beam-deflection";

describe("E01 — Flecha (ELS, Branson)", () => {
  it("Ecs (C25, granito) ≈ 24150 MPa", () => {
    expect(moduloSecante(25)).toBeCloseTo(24150, 0);
  });

  // Vetor hand-check: b=20 h=50 d=46, fck=25, As,ef=8.043 (4ø16), L=500cm, Mserv=70 kN·m.
  describe("retangular fissurada", () => {
    const r = calcularFlecha({
      secao: { forma: "retangular", b: 20, h: 50 },
      d: 46,
      dLinha: 4,
      fck: 25,
      As: 8.043,
      AsLinha: 0,
      vao: 500,
      mServ: 70,
    });

    it("αe ≈ 8.70", () => expect(r.alphaEs).toBeCloseTo(8.70, 1));
    it("Ic = 208333 cm⁴", () => expect(r.ic).toBeCloseTo(208333, 0));
    it("Mr ≈ 32.1 kN·m e seção fissura", () => {
      expect(r.mr).toBeCloseTo(32.06, 1);
      expect(r.fissura).toBe(true);
    });
    it("x_II ≈ 14.78 cm", () => expect(r.xII).toBeCloseTo(14.78, 1));
    it("I_II ≈ 89700 cm⁴", () => expect(r.iII).toBeCloseTo(89700, -2));
    it("flecha imediata ≈ 0.747 cm", () => expect(r.flechaImediata).toBeCloseTo(0.747, 1));
    it("flecha total ≈ 2.24 cm (αf=2)", () => {
      expect(r.alphaF).toBeCloseTo(2.0, 3);
      expect(r.flechaTotal).toBeCloseTo(2.24, 1);
    });
    it("excede L/250 = 2.0 cm → revisar", () => {
      expect(r.limite).toBeCloseTo(2.0, 3);
      expect(r.situacao).toBe("revisar");
    });
  });

  describe("seção pouco solicitada não fissura (Ieq = Ic)", () => {
    const r = calcularFlecha({
      secao: { forma: "retangular", b: 20, h: 50 },
      d: 46,
      dLinha: 4,
      fck: 25,
      As: 8.043,
      AsLinha: 0,
      vao: 500,
      mServ: 20, // < Mr
    });
    it("não fissura", () => {
      expect(r.fissura).toBe(false);
      expect(r.ieq).toBeCloseTo(r.ic, 0);
    });
  });
});
