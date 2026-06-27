import { describe, it, expect } from "vitest";
import { converter, UNIDADES, type Dimensao } from "./unit-convert";

describe("U01 — Conversor de Unidades", () => {
  describe("comprimento", () => {
    it("1 m = 1000 mm", () => {
      const r = converter({ dimensao: "comprimento", valor: 1, de: "m", para: "mm" });
      expect(r.valor).toBeCloseTo(1000, 6);
    });
    it("1 ft = 0.3048 m", () => {
      const r = converter({ dimensao: "comprimento", valor: 1, de: "ft", para: "m" });
      expect(r.valor).toBeCloseTo(0.3048, 6);
    });
    it("round-trip: 1 km → mm → km", () => {
      const toMm = converter({ dimensao: "comprimento", valor: 1, de: "km", para: "mm" });
      const back = converter({ dimensao: "comprimento", valor: toMm.valor, de: "mm", para: "km" });
      expect(back.valor).toBeCloseTo(1, 9);
    });
  });

  describe("área", () => {
    it("1 m² = 10000 cm²", () => {
      const r = converter({ dimensao: "area", valor: 1, de: "m2", para: "cm2" });
      expect(r.valor).toBeCloseTo(10000, 4);
    });
    it("1 ha = 10000 m²", () => {
      const r = converter({ dimensao: "area", valor: 1, de: "ha", para: "m2" });
      expect(r.valor).toBeCloseTo(10000, 4);
    });
  });

  describe("volume", () => {
    it("1 m³ = 1000 L", () => {
      const r = converter({ dimensao: "volume", valor: 1, de: "m3", para: "L" });
      expect(r.valor).toBeCloseTo(1000, 6);
    });
    it("1 ft³ ≈ 28.317 L", () => {
      const r = converter({ dimensao: "volume", valor: 1, de: "ft3", para: "L" });
      expect(r.valor).toBeCloseTo(28.316847, 3);
    });
  });

  describe("massa", () => {
    it("1 t = 1000 kg", () => {
      const r = converter({ dimensao: "massa", valor: 1, de: "t", para: "kg" });
      expect(r.valor).toBeCloseTo(1000, 6);
    });
    it("1 lb ≈ 0.4536 kg", () => {
      const r = converter({ dimensao: "massa", valor: 1, de: "lb", para: "kg" });
      expect(r.valor).toBeCloseTo(0.45359237, 6);
    });
  });

  describe("força", () => {
    it("1 tf = 9806.65 N", () => {
      const r = converter({ dimensao: "forca", valor: 1, de: "tf", para: "N" });
      expect(r.valor).toBeCloseTo(9806.65, 3);
    });
    it("1 tf = 9.80665 kN", () => {
      const r = converter({ dimensao: "forca", valor: 1, de: "tf", para: "kN" });
      expect(r.valor).toBeCloseTo(9.80665, 5);
    });
    it("1 kN ≈ 0.10197 tf", () => {
      const r = converter({ dimensao: "forca", valor: 1, de: "kN", para: "tf" });
      expect(r.valor).toBeCloseTo(1 / 9.80665, 5);
    });
  });

  describe("tensão / pressão", () => {
    it("1 MPa = 10.1972 kgf/cm²", () => {
      const r = converter({ dimensao: "tensao", valor: 1, de: "MPa", para: "kgf_cm2" });
      expect(r.valor).toBeCloseTo(1e6 / 98066.5, 4);
    });
    it("1 kgf/cm² ≈ 0.098066 MPa", () => {
      const r = converter({ dimensao: "tensao", valor: 1, de: "kgf_cm2", para: "MPa" });
      expect(r.valor).toBeCloseTo(98066.5 / 1e6, 6);
    });
    it("round-trip MPa → kgf/cm² → MPa", () => {
      const to = converter({ dimensao: "tensao", valor: 25, de: "MPa", para: "kgf_cm2" });
      const back = converter({ dimensao: "tensao", valor: to.valor, de: "kgf_cm2", para: "MPa" });
      expect(back.valor).toBeCloseTo(25, 6);
    });
  });

  describe("momento", () => {
    it("1 tf·m = 9806.65 N·m", () => {
      const r = converter({ dimensao: "momento", valor: 1, de: "tfm", para: "Nm" });
      expect(r.valor).toBeCloseTo(9806.65, 3);
    });
    it("1 kN·m = 1000 N·m", () => {
      const r = converter({ dimensao: "momento", valor: 1, de: "kNm", para: "Nm" });
      expect(r.valor).toBeCloseTo(1000, 6);
    });
  });

  describe("vazão", () => {
    it("1 m³/s = 1000 L/s", () => {
      const r = converter({ dimensao: "vazao", valor: 1, de: "m3_s", para: "L_s" });
      expect(r.valor).toBeCloseTo(1000, 6);
    });
    it("1 m³/h ≈ 0.2778 L/s", () => {
      const r = converter({ dimensao: "vazao", valor: 1, de: "m3_h", para: "L_s" });
      expect(r.valor).toBeCloseTo(1000 / 3600, 5);
    });
  });

  describe("ângulo", () => {
    it("180° = π rad", () => {
      const r = converter({ dimensao: "angulo", valor: 180, de: "deg", para: "rad" });
      expect(r.valor).toBeCloseTo(Math.PI, 9);
    });
    it("round-trip: 45° → rad → deg", () => {
      const toRad = converter({ dimensao: "angulo", valor: 45, de: "deg", para: "rad" });
      const back = converter({ dimensao: "angulo", valor: toRad.valor, de: "rad", para: "deg" });
      expect(back.valor).toBeCloseTo(45, 9);
    });
  });

  describe("identidade (de === para)", () => {
    it("1 kN → kN = 1 (fator = 1)", () => {
      const r = converter({ dimensao: "forca", valor: 1, de: "kN", para: "kN" });
      expect(r.valor).toBeCloseTo(1, 9);
      expect(r.fator).toBeCloseTo(1, 9);
    });
  });

  describe("erros", () => {
    it("lança para unidade desconhecida", () => {
      expect(() =>
        converter({ dimensao: "forca", valor: 1, de: "inexistente", para: "kN" })
      ).toThrow(/desconhecida/i);
    });
  });

  describe("cobertura — todas as dimensões têm ao menos 2 unidades", () => {
    const dimensoes = Object.keys(UNIDADES) as Dimensao[];
    for (const dim of dimensoes) {
      it(`${dim}: tem ≥ 2 unidades`, () => {
        expect(Object.keys(UNIDADES[dim]).length).toBeGreaterThanOrEqual(2);
      });
    }
  });
});
