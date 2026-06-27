import { describe, it, expect } from "vitest";
import { calcular } from "./pile-spt";

describe("E23 — Estaca por SPT", () => {
  // Hand-check: pré-moldada ø30, areia N=10 (4m) + areia N=20 (4m, ponta a 8m).
  const r = calcular({
    estaca: "pre_moldada",
    diametroCm: 30,
    camadas: [
      { solo: "areia", nspt: 10, espessuraM: 4 },
      { solo: "areia", nspt: 20, espessuraM: 4 },
    ],
  });

  it("geometria: Ap ≈ 0.0707 m², U ≈ 0.942 m, L = 8 m", () => {
    expect(r.ap).toBeCloseTo(0.07069, 4);
    expect(r.u).toBeCloseTo(0.9425, 3);
    expect(r.comprimento).toBe(8);
  });

  describe("Aoki-Velloso", () => {
    it("Rp ≈ 807.9 kN", () => expect(r.aoki.rp).toBeCloseTo(807.9, 0));
    it("Rl ≈ 452.4 kN", () => expect(r.aoki.rl).toBeCloseTo(452.4, 0));
    it("Radm ≈ 630 kN (FS=2)", () => expect(r.aoki.radm).toBeCloseTo(630.2, 0));
  });

  describe("Décourt-Quaresma", () => {
    it("Rp ≈ 565.5 kN", () => expect(r.decourt.rp).toBeCloseTo(565.5, 0));
    it("Rl ≈ 452.4 kN (N médio=15 → ql=60 kPa)", () => expect(r.decourt.rl).toBeCloseTo(452.4, 0));
    it("Radm ≈ 489 kN (Rp/4 + Rl/1.3)", () => expect(r.decourt.radm).toBeCloseTo(489.4, 0));
  });
});
