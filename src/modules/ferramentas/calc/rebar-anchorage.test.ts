import { describe, it, expect } from "vitest";
import { calcular } from "./rebar-anchorage";

describe("E10 — Ancoragem e traspasse (NBR 6118)", () => {
  // Hand-check: ø16, CA-50, fck=25, boa aderência, sem gancho, razaoAs=1.
  describe("ø16 CA-50 C25 boa aderência sem gancho", () => {
    const r = calcular({ phiMm: 16, aco: "CA-50", fck: 25, aderencia: "boa" });
    it("fbd ≈ 2.886 MPa", () => expect(r.fbd).toBeCloseTo(2.886, 2));
    it("lb ≈ 60.3 cm", () => expect(r.lb).toBeCloseTo(60.3, 0));
    it("lb,nec ≈ 60.3 cm (≥ lb,mín)", () => {
      expect(r.lbNec).toBeCloseTo(60.3, 0);
      expect(r.lbNec).toBeGreaterThanOrEqual(r.lbMin);
    });
    it("lb,mín ≈ 18.1 cm", () => expect(r.lbMin).toBeCloseTo(18.1, 0));
    it("traspasse (100% → α0t=2.0) ≈ 120.5 cm", () => {
      expect(r.alpha0t).toBe(2.0);
      expect(r.l0t).toBeCloseTo(120.5, 0);
    });
  });

  describe("com gancho reduz lb,nec (α=0.7)", () => {
    const r = calcular({ phiMm: 16, aco: "CA-50", fck: 25, aderencia: "boa", gancho: true });
    it("lb,nec ≈ 42.2 cm", () => expect(r.lbNec).toBeCloseTo(42.2, 0));
  });

  describe("má aderência aumenta lb (η2=0.7)", () => {
    const boa = calcular({ phiMm: 16, aco: "CA-50", fck: 25, aderencia: "boa" });
    const ma = calcular({ phiMm: 16, aco: "CA-50", fck: 25, aderencia: "ma" });
    it("lb(má) = lb(boa)/0.7", () => expect(ma.lb).toBeCloseTo(boa.lb / 0.7, 1));
  });

  describe("traspasse com 20% emendadas → α0t=1.2", () => {
    const r = calcular({ phiMm: 16, aco: "CA-50", fck: 25, aderencia: "boa", pctEmendadas: 20 });
    it("α0t = 1.2", () => expect(r.alpha0t).toBe(1.2));
    it("l0t ≈ 72.3 cm", () => expect(r.l0t).toBeCloseTo(72.3, 0));
  });
});
