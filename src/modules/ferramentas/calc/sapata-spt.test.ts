import { describe, it, expect } from "vitest";
import { calcular } from "./sapata-spt";

// Fixture da Situação II do material de referência: Fz = 50 tf = 490,33 kN; N(apoio) = 10; FM = 1,05.
// σadm = N/5 = 2 kgf/cm² = 196,13 kPa. Conversão: 1 kgf/cm² = 98,0665 kPa.
const camadas = [
  { solo: "argila_arenosa" as const, nspt: 10, espessuraM: 1 },
  { solo: "argila_arenosa" as const, nspt: 15, espessuraM: 1 },
  { solo: "argila_arenosa" as const, nspt: 17, espessuraM: 1 },
  { solo: "argila_arenosa" as const, nspt: 23, espessuraM: 1 },
];

describe("sapata-spt (Alonso + bulbo) — Situação II", () => {
  it("σadm = N/5 (kgf/cm²) convertido a kPa", () => {
    const r = calcular({ fz: 490.33, fm: 1.05, profundidadeM: 2, camadas });
    expect(r.nApoio).toBe(10);
    expect(r.sigmaAdmKpa).toBeCloseTo((10 / 5) * 98.0665, 1);
    expect(r.capadoN20).toBe(false);
  });

  it("lado B = √(FM·Fz/σadm), arredondado a 10 cm para cima", () => {
    const r = calcular({ fz: 490.33, fm: 1.05, profundidadeM: 2, camadas });
    const areaM2 = (1.05 * 490.33) / ((10 / 5) * 98.0665);
    expect(r.ladoCm % 10).toBe(0);
    expect(r.ladoCm / 100).toBeGreaterThanOrEqual(Math.sqrt(areaM2));
    expect(r.ladoCm / 100 - Math.sqrt(areaM2)).toBeLessThan(0.1);
  });

  it("capa N a 20 e σadm a 2,5 kgf/cm², com alertas", () => {
    const r = calcular({
      fz: 490.33, fm: 1.05, profundidadeM: 2,
      camadas: [{ solo: "areia", nspt: 30, espessuraM: 4 }],
    });
    expect(r.capadoN20).toBe(true);
    // N capado a 20 daria 4 kgf/cm²; o teto de σadm por correlação (2,5 kgf/cm²) governa.
    expect(r.sigmaAdmKpa).toBeCloseTo(2.5 * 98.0665, 1);
    expect(r.alertas.some((a) => a.includes("N ≤ 20"))).toBe(true);
    expect(r.alertas.some((a) => a.includes("2,5 kgf/cm²"))).toBe(true);
  });

  it("recalcula o N do bulbo a partir das camadas (não hardcoded)", () => {
    const r = calcular({ fz: 490.33, fm: 1.05, profundidadeM: 2, camadas });
    expect(r.bulboM).toBeCloseTo(2 * (r.ladoCm / 100), 6);
    // Perfil só tem 4 m: dentro do bulbo (2B ≈ 3,4 m) entram 10,15,17 e parte de 23.
    expect(r.nBulbo).toBeGreaterThan(10);
    expect(r.nBulbo).toBeLessThan(23);
    expect(r.bulboOk).toBe(true);
    expect(r.situacao).toBe("ok");
  });

  it("perfil que piora com a profundidade reprova o bulbo", () => {
    const r = calcular({
      fz: 490.33, fm: 1.05, profundidadeM: 2,
      camadas: [
        { solo: "areia", nspt: 18, espessuraM: 0.5 },
        { solo: "argila", nspt: 2, espessuraM: 8 },
      ],
    });
    expect(r.bulboOk).toBe(false);
    expect(r.situacao).toBe("revisar");
    expect(r.alertas.some((a) => a.includes("bulbo"))).toBe(true);
  });

  it("avisa quando a sondagem não alcança o bulbo", () => {
    const r = calcular({
      fz: 490.33, fm: 1.05, profundidadeM: 2,
      camadas: [{ solo: "argila_arenosa", nspt: 10, espessuraM: 1 }],
    });
    expect(r.perfilInsuficiente).toBe(true);
    expect(r.alertas.some((a) => a.includes("sondagem"))).toBe(true);
  });
});
