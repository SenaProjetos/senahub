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
    // Default pctAlivio = 0,5: R2 = 800 − 0,5·105,88 = 747,06 kN (antes, com alívio integral, 694,12).
    it("R2 = P2 − 0,5·(R1−P1) ≈ 747,1 kN (alívio parcial default)", () => expect(r.r2).toBeCloseTo(747.06, 0));
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

  describe("Fator de alívio da sapata de reação", () => {
    const base = {
      modo: "viga_equilibrio", p1: 400, p2: 1600, ell: 300, ap1: 20, a1: 100,
      sigmaAdm: 200, fck: 25, aco: "CA-50",
    } as const;

    it("aplica fator de alívio parcial (default 50%) na sapata de reação", () => {
      const meio = calcular({ ...base }) as ResultadoViga; // default 50%
      const cheio = calcular({ ...base, pctAlivio: 1 }) as ResultadoViga; // hipótese teórica
      // r2(50%) = p2 − 0,5·ΔP > r2(100%) = p2 − ΔP → default mais conservador (sapata interna maior).
      expect(meio.r2).toBeGreaterThan(cheio.r2);
      expect(meio.r2).toBeCloseTo(base.p2 - 0.5 * meio.deltaP2, 6);
      expect(cheio.r2).toBeCloseTo(base.p2 - cheio.deltaP2, 6);
    });

    it("pctAlivio = 0 ignora o alívio (hipótese mais segura)", () => {
      const semAlivio = calcular({ ...base, pctAlivio: 0 }) as ResultadoViga;
      expect(semAlivio.r2).toBeCloseTo(base.p2, 6);
    });
  });

  // Caracterização da Situação VII do material de referência (viga alavanca).
  // R1 = P1·ℓ/(ℓ−e) daqui ≡ R1 = P1 + P1·e/d do material, com d = ℓ−e.
  // Conversões: 40 tf = 392,266 kN; 160 tf = 1569,064 kN; 2,0 kgf/cm² = 196,133 kPa.
  describe("Situação VII (caracterização da viga alavanca)", () => {
    it("R1 = P1·ℓ/(ℓ−e) coerente com a formulação incremental do material de referência", () => {
      const r = calcular({
        modo: "viga_equilibrio", p1: 392.266, p2: 1569.064,
        ell: 300, ap1: 20, a1: 100,
        sigmaAdm: 196.133, fck: 25, aco: "CA-50",
      }) as ResultadoViga;
      // e = (a1 − ap1)/2 = 40 cm → R1 = P1·300/(300−40)
      expect(r.e).toBeCloseTo(40, 6);
      expect(r.r1).toBeCloseTo((392.266 * 300) / (300 - 40), 2);
      expect(r.deltaP2).toBeCloseTo(r.r1 - 392.266, 2);
    });
  });
});
