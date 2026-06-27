import { describe, it, expect } from "vitest";
import { calcular } from "./stair";

// Hand-check: lance reto sem patamar, piso 28, espelho 18, aLance 280 cm, hl 12, revest 1, q 3.
// cosα=0,8412 → gLance=25·0,12/0,8412 + 25·0,09 + 1 = 6,8165; wLance=9,8165 kN/m; L=2,8 m.
const base = { piso: 28, espelho: 18, aLance: 280, hLaje: 12, revest: 1, q: 3, fck: 25, aco: "CA-50" as const };

describe("E08 — Escada (lance reto, NBR 6118)", () => {
  it("cargas e inclinação", () => {
    const r = calcular({ ...base, vinculacao: "biapoiado" });
    expect(r.alphaGraus).toBeCloseTo(32.74, 1);
    expect(r.gLance).toBeCloseTo(6.8165, 2);
    expect(r.wLance).toBeCloseTo(9.8165, 2);
    expect(r.L).toBeCloseTo(2.8, 6);
  });

  it("biapoiado: Mvão = wL²/8 ≈ 9,62; sem momento de apoio", () => {
    const r = calcular({ ...base, vinculacao: "biapoiado" });
    expect(r.mVaoMax).toBeCloseTo(9.62, 1);
    expect(r.mApoioMax).toBeCloseTo(0, 3);
    expect(r.ra).toBeCloseTo(13.743, 2);
    expect(r.rb).toBeCloseTo(13.743, 2);
    expect(r.asVao).toBeCloseTo(3.44, 1); // d=9,5; flexão simples
  });

  it("biengastado: Mapoio = wL²/12 ≈ 6,41; Mvão = wL²/24 ≈ 3,21", () => {
    const r = calcular({ ...base, vinculacao: "biengastado" });
    expect(r.mApoioMax).toBeCloseTo(6.413, 1);
    expect(r.mVaoMax).toBeCloseTo(3.207, 1);
    expect(r.asApoio).toBeGreaterThan(r.asVao); // apoio governa
  });

  it("engastado-apoiado: Mapoio = wL²/8 ≈ 9,62; Mvão = 9wL²/128 ≈ 5,41", () => {
    const r = calcular({ ...base, vinculacao: "engastado_apoiado" });
    expect(r.mApoioMax).toBeCloseTo(9.62, 1);
    expect(r.mVaoMax).toBeCloseTo(5.41, 1);
  });

  it("com patamar: aumenta o vão e o momento", () => {
    const semPatamar = calcular({ ...base, vinculacao: "biapoiado" });
    const comPatamar = calcular({ ...base, aPatamar: 120, vinculacao: "biapoiado" });
    expect(comPatamar.L).toBeCloseTo(4.0, 6);
    expect(comPatamar.mVaoMax).toBeGreaterThan(semPatamar.mVaoMax);
  });

  it("As,mín governa quando o momento é pequeno", () => {
    const r = calcular({ ...base, aLance: 120, q: 1, vinculacao: "biapoiado" });
    expect(r.asVao).toBeCloseTo(r.asMin, 2); // 0,15%·100·12 = 1,8 cm²/m
    expect(r.asMin).toBeCloseTo(1.8, 2);
  });
});
