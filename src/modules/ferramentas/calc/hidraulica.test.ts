import { describe, it, expect } from "vitest";
import {
  calcularTrecho,
  diametroAcima,
  diametroForchheimerMm,
  dimensionarMotor,
  margemDePotencia,
  menorDiametroInterno,
  menorDiametroPorVelocidade,
  motorComercial,
  perdaUnitariaHW,
  potenciaCv,
  velocidade,
} from "./hidraulica";

describe("hidráulica de tubulações", () => {
  it("Hazen-Williams: 1 L/s em DN32 (interno 27,8 mm), C = 140 → J ≈ 0,1214 m/m", () => {
    expect(perdaUnitariaHW(0.001, 27.8, 140)).toBeCloseTo(0.121403, 5);
  });

  it("velocidade: 1 L/s em 27,8 mm ≈ 1,647 m/s", () => {
    expect(velocidade(0.001, 27.8)).toBeCloseTo(1.64748, 4);
  });

  it("Forchheimer: 5 m³/h durante 6 h/dia → 34,26 mm", () => {
    expect(diametroForchheimerMm(5 / 3600, 6)).toBeCloseTo(34.258, 2);
  });

  it("menor DN com interno ≥ calculado: 34,26 mm → DN40 (35,2 mm)", () => {
    expect(menorDiametroInterno(34.26)?.dn).toBe(40);
    expect(menorDiametroInterno(35.2)?.dn).toBe(40);
    expect(menorDiametroInterno(35.3)?.dn).toBe(50);
    expect(menorDiametroInterno(120)).toBeNull();
  });

  it("DN imediatamente acima; o maior não tem", () => {
    expect(diametroAcima(40)?.dn).toBe(50);
    expect(diametroAcima(110)).toBeNull();
  });

  it("menor DN por velocidade: 8 m³/h, limite 1,8 m/s → DN50; limite 3,0 → DN40", () => {
    const q = 8 / 3600;
    expect(menorDiametroPorVelocidade(q, 1.8)?.dn).toBe(50);
    expect(menorDiametroPorVelocidade(q, 3.0)?.dn).toBe(40);
    expect(menorDiametroPorVelocidade(1, 1.8)).toBeNull();
  });

  it("trecho soma o comprimento equivalente ao real", () => {
    const t = calcularTrecho({ vazaoM3s: 0.001, dn: 32, comprimentoM: 10, leqM: 5, c: 140 });
    expect(t.comprimentoTotalM).toBe(15);
    expect(t.perdaMca).toBeCloseTo(0.121403 * 15, 3);
    expect(t.internoMm).toBe(27.8);
  });

  it("DN fora do catálogo é recusado", () => {
    expect(() => calcularTrecho({ vazaoM3s: 0.001, dn: 33, comprimentoM: 1, leqM: 0, c: 140 })).toThrow();
  });

  it("potência: 1,3889 L/s a 23,016 mca com η = 60 % → 0,7106 cv", () => {
    expect(potenciaCv(5 / 3600, 23.0159, 0.6)).toBeCloseTo(0.7106, 3);
  });

  it("margem por faixa (Macintyre)", () => {
    expect(margemDePotencia(1)).toBe(0.5);
    expect(margemDePotencia(2)).toBe(0.5);
    expect(margemDePotencia(2.01)).toBe(0.3);
    expect(margemDePotencia(7)).toBe(0.2);
    expect(margemDePotencia(15)).toBe(0.15);
    expect(margemDePotencia(50)).toBe(0.1);
  });

  it("motor comercial: o menor ≥ pedido; acima de 200 cv não há", () => {
    expect(motorComercial(1.066)).toBe(1.5);
    expect(motorComercial(1)).toBe(1);
    expect(motorComercial(250)).toBeNull();
  });

  it("dimensionar: 0,7106 cv + 50 % = 1,066 cv → motor de 1,5 cv", () => {
    const m = dimensionarMotor(5 / 3600, 23.0159, 0.6);
    expect(m.margem).toBe(0.5);
    expect(m.comMargemCv).toBeCloseTo(1.0659, 3);
    expect(m.motorCv).toBe(1.5);
  });
});
