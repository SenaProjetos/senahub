import { describe, it, expect } from "vitest";
import { calcular, type ResultadoIsolada, type ResultadoViga } from "./eccentric-footing";

describe("E22 — Sapatas excêntricas", () => {
  describe("Modo isolada (tensões no solo)", () => {
    it("e ≤ a/6: diagrama trapezoidal", () => {
      const r = calcular({
        modo: "isolada", nk: 800, mk: 80, a: 200, b: 150, ap: 30, sigmaAdm: 400, h: 50, fck: 25, aco: "CA-50",
      }) as ResultadoIsolada;
      expect(r.e).toBeCloseTo(10, 1); // M/N = 0,1 m
      expect(r.emax).toBeCloseTo(33.33, 1); // a/6
      expect(r.descola).toBe(false);
      expect(r.sigmaMax).toBeCloseTo(346.67, 0); // 266,67·1,3
      expect(r.sigmaMin).toBeCloseTo(186.67, 0);
      expect(r.sigmaOk).toBe(true);
    });

    it("e > a/6: diagrama triangular (descolamento)", () => {
      const r = calcular({
        modo: "isolada", nk: 800, mk: 400, a: 200, b: 150, ap: 30, sigmaAdm: 800, h: 50, fck: 25, aco: "CA-50",
      }) as ResultadoIsolada;
      expect(r.e).toBeCloseTo(50, 1);
      expect(r.descola).toBe(true);
      // x = 3·(1,0−0,5) = 1,5 m; σmax = 2·800/(1,5·1,5) = 711,1 kPa
      expect(r.sigmaMax).toBeCloseTo(711.1, 0);
      expect(r.alertas.some((a) => a.includes("descolamento"))).toBe(true);
    });
  });

  describe("Modo viga de equilíbrio (alavanca)", () => {
    const r = calcular({
      modo: "viga_equilibrio", p1: 600, p2: 800, ell: 400, ap1: 30, a1: 150,
      sigmaAdm: 300, fck: 25, aco: "CA-50",
    }) as ResultadoViga;

    it("excentricidade e = (a1−ap1)/2 = 60 cm", () => expect(r.e).toBeCloseTo(60, 1));
    it("R1 = P1·ℓ/(ℓ−e) ≈ 705,9 kN (majorada)", () => expect(r.r1).toBeCloseTo(705.88, 0));
    it("R2 = P2 − (R1−P1) ≈ 694,1 kN (aliviada)", () => expect(r.r2).toBeCloseTo(694.12, 0));
    it("M_viga = R1·e ≈ 423,5 kN·m", () => expect(r.mViga).toBeCloseTo(423.53, 0));
    it("sapata de divisa: b1 dimensionada, σ1 ≤ σadm", () => {
      expect(r.b1).toBe(165);
      expect(r.sigma1).toBeLessThanOrEqual(300 * 1.001);
    });
    it("dimensiona viga (As > 0) e sapata interna (E21)", () => {
      expect(r.asViga).toBeGreaterThan(0);
      expect(r.a2).toBeGreaterThan(0);
      expect(r.as2porM).toBeGreaterThan(0);
    });
  });
});
