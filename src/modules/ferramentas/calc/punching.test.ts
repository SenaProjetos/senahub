import { describe, it, expect } from "vitest";
import { calcular, coefK } from "./punching";

// Base: pilar 40×40, d=16 cm, fck=25, FSd=600 kN, ρ=1% nas duas direções.
const base = { c1: 40, c2: 40, d: 16, fck: 25, fSd: 600, rhoX: 1, rhoY: 1 };

describe("E07 — Punção (NBR 6118 §19.5)", () => {
  it("K da Tabela 19.2 (c1/c2)", () => {
    expect(coefK(40, 40)).toBeCloseTo(0.6, 3); // r=1 → 0,60
    expect(coefK(20, 40)).toBeCloseTo(0.45, 3); // r=0,5 → 0,45
    expect(coefK(80, 40)).toBeCloseTo(0.7, 3); // r=2 → 0,70
  });

  it("perímetros interno: u0 = 2(c1+c2); u1 = 2(c1+c2)+4πd", () => {
    const r = calcular({ ...base, posicao: "interno", mSd: 0 });
    expect(r.u0).toBeCloseTo(160, 6);
    expect(r.u1).toBeCloseTo(2 * 80 + 4 * Math.PI * 16, 0); // ≈361,06
  });

  it("Wp numérico reproduz a fórmula fechada da NBR (interno)", () => {
    const r = calcular({ ...base, posicao: "interno", mSd: 0 });
    // Wp = c1²/2 + c1c2 + 4c2d + 16d² + 2πd·c1
    const wpFechada = 40 ** 2 / 2 + 40 * 40 + 4 * 40 * 16 + 16 * 16 ** 2 + 2 * Math.PI * 16 * 40;
    expect(r.wp).toBeCloseTo(wpFechada, -2); // ±50 cm² (amostragem dos arcos)
  });

  it("β = 1 sem momento; β > 1 com momento", () => {
    const sem = calcular({ ...base, posicao: "interno", mSd: 0 });
    expect(sem.beta).toBeCloseTo(1, 6);
    const com = calcular({ ...base, posicao: "interno", mSd: 30 });
    // β = 1 + 0,6·3000·u1/(Wp·600)
    expect(com.beta).toBeCloseTo(1.083, 2);
  });

  it("verificações de tensão e necessidade de armadura", () => {
    const r = calcular({ ...base, posicao: "interno", mSd: 0 });
    expect(r.tauSd0).toBeCloseTo(2.344, 2); // MPa
    expect(r.tauRd2).toBeCloseTo(4.339, 2);
    expect(r.okBiela).toBe(true);
    expect(r.tauSd1).toBeCloseTo(1.039, 2);
    expect(r.tauRd1).toBeCloseTo(0.805, 2);
    expect(r.precisaArmadura).toBe(true);
    expect(r.asw).toBeGreaterThan(0);
    expect(r.distC2).toBeGreaterThan(2 * 16);
  });

  it("biela esmaga com força muito alta → revisar", () => {
    const r = calcular({ ...base, posicao: "interno", fSd: 3000, mSd: 0 });
    expect(r.okBiela).toBe(false);
    expect(r.situacao).toBe("revisar");
  });

  it("perímetros reduzidos: borda (2c1+c2+2πd) e canto (c1+c2+πd)", () => {
    const borda = calcular({ ...base, posicao: "borda", mSd: 0 });
    expect(borda.u1).toBeCloseTo(2 * 40 + 40 + 2 * Math.PI * 16, 0); // ≈220,53
    expect(borda.u0).toBeCloseTo(2 * 40 + 40, 6); // 120
    const canto = calcular({ ...base, posicao: "canto", mSd: 0 });
    expect(canto.u1).toBeCloseTo(40 + 40 + Math.PI * 16, 0); // ≈130,27
    expect(canto.u0).toBeCloseTo(80, 6);
  });

  it("carga baixa: passa sem armadura", () => {
    const r = calcular({ ...base, posicao: "interno", fSd: 300, mSd: 0 });
    expect(r.precisaArmadura).toBe(false);
    expect(r.situacao).toBe("ok");
  });
});
