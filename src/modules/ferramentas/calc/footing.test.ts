import { describe, it, expect } from "vitest";
import { calcular } from "./footing";

// Hand-check: Nk=1000 kN, σadm=300 kPa, pilar 30×30, h=60, pp=5%, fck=25, CA-50.
const base = { nk: 1000, sigmaAdm: 300, ap: 30, bp: 30, h: 60, fck: 25, aco: "CA-50" as const };

describe("E21 — Sapata isolada (NBR 6118/6122)", () => {
  it("dimensiona a base por abas iguais e checa o solo", () => {
    const r = calcular(base);
    // A_req = 1050/300 = 3,5 m² → c≈1,571 → a=b≈187 → arredonda p/ 190 cm.
    expect(r.a).toBe(190);
    expect(r.b).toBe(190);
    expect(r.sigmaSolo).toBeCloseTo(290.86, 0); // 1050/3,61
    expect(r.sigmaOk).toBe(true);
  });

  it("classifica como rígida (h ≥ (a−ap)/3)", () => {
    const r = calcular(base);
    expect(r.hMinRigida).toBeCloseTo(53.33, 1); // (190−30)/3
    expect(r.rigida).toBe(true);
    expect(r.metodo).toBe("bielas");
  });

  it("bielas-tirantes: T = Nd·(a−ap)/(8d) → As calc", () => {
    const r = calcular(base);
    // Nd=1400; d=55; T=1400·160/(8·55)=509,09 kN; As=509,09/43,478=11,71 cm² (total b=1,90)
    // por metro: 11,71/1,90 = 6,16 cm²/m
    expect(r.asACalcPorM).toBeCloseTo(6.16, 1);
  });

  it("As,mín de sapata espessa governa (0,15%·100·60 = 9 cm²/m)", () => {
    const r = calcular(base);
    expect(r.asMin).toBeCloseTo(9.0, 1);
    expect(r.asAporM).toBeCloseTo(9.0, 1); // máx(6,16; 9,0)
  });

  it("sapata flexível (h baixo) usa flexão + verifica punção (reusa E07)", () => {
    const r = calcular({ ...base, h: 30 }); // h=30 < (190−30)/3=53,3 → flexível
    expect(r.rigida).toBe(false);
    expect(r.metodo).toBe("flexao");
    expect(r.puncao).not.toBeNull();
    expect(r.asACalcPorM).toBeGreaterThan(0);
  });

  it("σadm insuficiente → base maior, mantém σsolo ≤ σadm", () => {
    const r = calcular({ ...base, sigmaAdm: 150 });
    expect(r.area).toBeGreaterThan(6); // ~7 m²
    expect(r.sigmaSolo).toBeLessThanOrEqual(150 * 1.001);
  });
});
