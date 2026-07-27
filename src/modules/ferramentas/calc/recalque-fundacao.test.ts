import { describe, it, expect } from "vitest";
import { calcular } from "./recalque-fundacao";

describe("recalque-fundacao / elastico (Situação IX)", () => {
  it("q, rigidez, Iw interpolado e recalque coerentes", () => {
    const r = calcular({ modo: "elastico", fz: 800, bM: 2.5, lM: 3.2, hbM: 0.9, apCm: 25, lpCm: 65, euKpa: 30000, nu: 0.5 });
    if (r.modo !== "elastico") throw new Error("modo inesperado");
    expect(r.qKpa).toBeCloseTo(800 / (2.5 * 3.2), 3); // 100 kPa
    // rigidez: Hb=90 cm ≥ máx((250−25)/3=75 ; (320−65)/3=85) → rígida
    expect(r.rigida).toBe(true);
    const lb = 3.2 / 2.5; // 1,28
    expect(r.lb).toBeCloseTo(lb, 6);
    expect(r.iw).toBeCloseTo(0.86 + (lb - 1) * (1.17 - 0.86), 6);
    const esperadoMm = ((r.qKpa * 2.5 * (1 - 0.5 * 0.5)) / 30000) * r.iw * 1000;
    expect(r.recalqueMm).toBeCloseTo(esperadoMm, 4);
  });

  it("marca flexível e alerta quando Hb é insuficiente", () => {
    const r = calcular({ modo: "elastico", fz: 800, bM: 2.5, lM: 3.2, hbM: 0.3, apCm: 25, lpCm: 65, euKpa: 30000, nu: 0.5 });
    if (r.modo !== "elastico") throw new Error("modo");
    expect(r.rigida).toBe(false);
    expect(r.alertas.some((a) => a.includes("flexível"))).toBe(true);
  });

  it("alerta quando L/B > 2 (Iw extrapolado)", () => {
    const r = calcular({ modo: "elastico", fz: 800, bM: 1, lM: 3, hbM: 2, apCm: 20, lpCm: 20, euKpa: 30000, nu: 0.5 });
    if (r.modo !== "elastico") throw new Error("modo");
    expect(r.alertas.some((a) => a.includes("L/B"))).toBe(true);
  });
});

describe("recalque-fundacao / fatias (Holl, Situação VIII)", () => {
  const entrada = {
    modo: "fatias" as const,
    fz: 411.88,
    bM: 1.0,
    lM: 1.4,
    camadas: [
      { solo: "argila_arenosa" as const, nspt: 15, espessuraM: 2 },
      { solo: "areia_argilosa" as const, nspt: 20, espessuraM: 5 },
    ],
  };

  it("q, número de fatias (até 6B) e recalque coerentes", () => {
    const r = calcular(entrada);
    if (r.modo !== "fatias") throw new Error("modo");
    expect(r.qKpa).toBeCloseTo(411.88 / (1.0 * 1.4), 2);
    const somaDz = r.fatias.reduce((s, f) => s + f.dzM, 0);
    expect(somaDz).toBeGreaterThanOrEqual(6.0 - 1e-9);
    expect(r.fatias.length).toBeGreaterThan(0);
    expect(r.recalqueMm).toBeGreaterThan(0);
    // Es da 1ª fatia (argila arenosa, N=15): α·K·N = 7·0,30·15 = 31,5 MPa = 31500 kPa
    expect(r.fatias[0].esKpa).toBeCloseTo(7 * 0.3 * 15 * 1000, 3);
  });

  it("Δσ decresce com a profundidade e é ≤ q", () => {
    const r = calcular(entrada);
    if (r.modo !== "fatias") throw new Error("modo");
    expect(r.fatias[0].dSigmaKpa).toBeLessThanOrEqual(r.qKpa * 1.001);
    for (let i = 1; i < r.fatias.length; i++) {
      expect(r.fatias[i].dSigmaKpa).toBeLessThan(r.fatias[i - 1].dSigmaKpa);
    }
  });

  it("alerta quando a sondagem é mais rasa que 6B", () => {
    const r = calcular({ ...entrada, camadas: [{ solo: "argila_arenosa", nspt: 15, espessuraM: 2 }] });
    if (r.modo !== "fatias") throw new Error("modo");
    expect(r.alertas.some((a) => a.includes("6B"))).toBe(true);
  });
});

describe("recalque-fundacao / adensamento (Situação X)", () => {
  it("ρa, correção μ e tempos coerentes", () => {
    const r = calcular({
      modo: "adensamento", dqKpa: 100, hM: 10, cc: 0.3, e0: 1.8,
      sigmaIniKpa: 68, mu: 0.84, cvCm2s: 0.004, tDias: 30,
    });
    if (r.modo !== "adensamento") throw new Error("modo");
    const hCm = 1000;
    const sf = 168;
    const raEsperado = ((0.3 * hCm) / (1 + 1.8)) * Math.log10(sf / 68);
    expect(r.rhoTeoricoCm).toBeCloseTo(raEsperado, 4);
    expect(r.rhoRealCm).toBeCloseTo(0.84 * raEsperado, 4);
    // t100 = 2,0·Hd²/cv, com Hd = 500 cm (drenagem dupla)
    expect(r.t100Anos).toBeCloseTo((2.0 * 500 * 500) / 0.004 / 31536000, 3);
    expect(r.rhoTdiasCm).toBeGreaterThan(0);
    expect(r.rhoTdiasCm).toBeLessThan(r.rhoRealCm);
  });

  it("drenagem simples dobra Hd (quadruplica o tempo)", () => {
    const base = {
      modo: "adensamento" as const, dqKpa: 100, hM: 10, cc: 0.3, e0: 1.8,
      sigmaIniKpa: 68, mu: 0.84, cvCm2s: 0.004, tDias: 30,
    };
    const dupla = calcular(base);
    const simples = calcular({ ...base, drenagem: "simples" });
    if (dupla.modo !== "adensamento" || simples.modo !== "adensamento") throw new Error("modo");
    expect(simples.t100Anos).toBeCloseTo(4 * dupla.t100Anos, 6);
    expect(simples.rhoRealCm).toBeCloseTo(dupla.rhoRealCm, 6); // magnitude não muda
  });
});

describe("recalque-fundacao / secundaria (Situação XI)", () => {
  it("ρs, ρtotal e admissibilidade", () => {
    const r = calcular({
      modo: "secundaria", caPct: 0.6, t2Anos: 50, t1Anos: 3.96, hM: 10,
      rhoImediatoCm: 0.59, rhoAdensamentoCm: 35.35, rhoAdmCm: 5.0,
    });
    if (r.modo !== "secundaria") throw new Error("modo");
    const rsEsperado = (0.6 / 100) * Math.log10(50 / 3.96) * 1000; // H = 1000 cm
    expect(r.rhoSecundariaCm).toBeCloseTo(rsEsperado, 4);
    expect(r.rhoTotalCm).toBeCloseTo(0.59 + 35.35 + rsEsperado, 4);
    expect(r.aceitavel).toBe(false); // argila mole governa
    expect(r.alertas.some((a) => a.includes("fundação profunda"))).toBe(true);
  });

  it("aceita quando o total fica abaixo do admissível", () => {
    const r = calcular({
      modo: "secundaria", caPct: 0.2, t2Anos: 50, t1Anos: 10, hM: 2,
      rhoImediatoCm: 0.5, rhoAdensamentoCm: 1.0, rhoAdmCm: 5.0,
    });
    if (r.modo !== "secundaria") throw new Error("modo");
    expect(r.aceitavel).toBe(true);
    expect(r.alertas).toHaveLength(0);
  });

  it("rejeita t2 ≤ t1 (log negativo)", () => {
    expect(() =>
      calcular({
        modo: "secundaria", caPct: 0.6, t2Anos: 3, t1Anos: 10, hM: 10,
        rhoImediatoCm: 0, rhoAdensamentoCm: 0, rhoAdmCm: 5,
      }),
    ).toThrow();
  });
});
