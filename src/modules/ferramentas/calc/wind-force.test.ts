import { describe, it, expect } from "vitest";
import { calcular } from "./wind-force";

describe("E13 — Vento (NBR 6123:1988)", () => {
  describe("S2, Vk e q a z = 10 m (Cat II, Classe B)", () => {
    // b=1.00, Fr=0.98, p=0.09 → S2 = 1.00·0.98·(10/10)^0.09 = 0.98
    const r = calcular({ v0: 40, categoria: "II", classe: "B", z: 10, grupoS3: "2" });
    it("S2 ≈ 0.98", () => expect(r.s2).toBeCloseTo(0.98, 4));
    it("S3 = 1.00 (grupo 2)", () => expect(r.s3).toBeCloseTo(1.0, 6));
    it("Vk = 39.2 m/s (40·1·0.98·1)", () => expect(r.vk).toBeCloseTo(39.2, 3));
    it("q ≈ 942.0 N/m²", () => expect(r.q).toBeCloseTo(942.0, 0));
    it("q em kN/m² ≈ 0.942", () => expect(r.qkN).toBeCloseTo(0.942, 3));
  });

  describe("Perfil de altura (Cat II, Classe B, z = 30 m)", () => {
    // S2 = 0.98·(30/10)^0.09 = 0.98·3^0.09 ≈ 1.08185
    const r = calcular({ v0: 40, categoria: "II", classe: "B", z: 30, grupoS3: "2" });
    it("S2 ≈ 1.0819", () => expect(r.s2).toBeCloseTo(1.08185, 4));
    it("Vk ≈ 43.27 m/s", () => expect(r.vk).toBeCloseTo(43.274, 2));
    it("q ≈ 1148.0 N/m²", () => expect(r.q).toBeCloseTo(1148.0, 0));
  });

  describe("Categoria IV, Classe B, z = 10 m", () => {
    // b=0.85, Fr=0.98, p=0.125 → S2 = 0.85·0.98·1 = 0.833
    const r = calcular({ v0: 45, categoria: "IV", classe: "B", z: 10, grupoS3: "2" });
    it("S2 ≈ 0.833", () => expect(r.s2).toBeCloseTo(0.833, 3));
    it("Vk ≈ 37.485 m/s", () => expect(r.vk).toBeCloseTo(37.485, 2));
  });

  describe("Fatores S1 e S3 personalizados", () => {
    it("S1 = 0.9 (vale) reduz Vk", () => {
      const r = calcular({ v0: 40, s1: 0.9, categoria: "II", classe: "B", z: 10, grupoS3: "2" });
      expect(r.vk).toBeCloseTo(35.28, 2); // 40·0.9·0.98·1
    });
    it("S3 grupo 1 = 1.10", () => {
      const r = calcular({ v0: 40, categoria: "II", classe: "B", z: 10, grupoS3: "1" });
      expect(r.s3).toBeCloseTo(1.1, 6);
      expect(r.vk).toBeCloseTo(43.12, 2); // 40·1·0.98·1.1
    });
  });

  describe("Força de arrasto", () => {
    // Vento a z=10 (q≈942.0 N/m²), Ae = l1·h = 20·10 = 200, Ca = 1.3
    const r = calcular({ v0: 40, categoria: "II", classe: "B", z: 10, grupoS3: "2", l1: 20, l2: 15, h: 10, ca: 1.3 });
    it("Ae = 200 m²", () => expect(r.forca?.ae).toBeCloseTo(200, 6));
    it("F ≈ 244.9 kN (Ca·q·Ae)", () => expect(r.forca?.f).toBeCloseTo(244.92, 1));
    it("razão h/l1 = 0.5", () => expect(r.forca?.razaoHL1).toBeCloseTo(0.5, 6));
    it("razão l1/l2 ≈ 1.333", () => expect(r.forca?.razaoL1L2).toBeCloseTo(1.3333, 3));
  });

  it("sem geometria → força nula", () => {
    const r = calcular({ v0: 40, categoria: "II", classe: "B", z: 10, grupoS3: "2" });
    expect(r.forca).toBeNull();
  });
});
