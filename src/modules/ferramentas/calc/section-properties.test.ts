import { describe, it, expect } from "vitest";
import { calcular, propsPoligono } from "./section-properties";

describe("U02 — Propriedades de seção", () => {
  describe("retangular", () => {
    const b = 20;
    const h = 50;
    const r = calcular({ tipo: "retangular", b, h });

    it("área = b·h", () => {
      expect(r.A).toBeCloseTo(b * h, 6);
    });
    it("centroide em (0, h/2)", () => {
      expect(r.centroide.x).toBeCloseTo(0, 6);
      expect(r.centroide.y).toBeCloseTo(h / 2, 6);
    });
    it("Ix = b·h³/12", () => {
      expect(r.Ix).toBeCloseTo((b * h ** 3) / 12, 4);
    });
    it("Iy = h·b³/12", () => {
      expect(r.Iy).toBeCloseTo((h * b ** 3) / 12, 4);
    });
    it("Wx = b·h²/6 (simétrico, sup = inf)", () => {
      const W = (b * h ** 2) / 6;
      expect(r.Wx_sup).toBeCloseTo(W, 4);
      expect(r.Wx_inf).toBeCloseTo(W, 4);
    });
    it("ix = h/√12", () => {
      expect(r.ix).toBeCloseTo(h / Math.sqrt(12), 6);
    });
    it("Ixy = 0 (seção simétrica)", () => {
      expect(r.Ixy).toBeCloseTo(0, 4);
    });
  });

  describe("circular", () => {
    const d = 40;
    const r = calcular({ tipo: "circular", d });
    const raio = d / 2;
    it("área = π·r²", () => {
      expect(r.A).toBeCloseTo(Math.PI * raio ** 2, 4);
    });
    it("I = π·d⁴/64", () => {
      expect(r.Ix).toBeCloseTo((Math.PI * d ** 4) / 64, 2);
      expect(r.Iy).toBeCloseTo(r.Ix, 6);
    });
    it("W = π·d³/32", () => {
      expect(r.Wx_sup).toBeCloseTo((Math.PI * d ** 3) / 32, 3);
    });
    it("i = r/2", () => {
      expect(r.ix).toBeCloseTo(raio / 2, 6);
    });
    it("geometria é círculo", () => {
      expect(r.geometria.tipo).toBe("circulo");
    });
  });

  describe("T (bf=30, hf=10, bw=15, hw=40)", () => {
    const r = calcular({ tipo: "T", bf: 30, hf: 10, bw: 15, hw: 40 });
    it("área = web + flange = 900", () => {
      expect(r.A).toBeCloseTo(900, 6);
    });
    it("centroide y ≈ 28.333", () => {
      // (600·20 + 300·45)/900
      expect(r.centroide.y).toBeCloseTo(28.3333, 3);
    });
    it("Ix ≈ 207500 cm⁴ (Steiner manual)", () => {
      expect(r.Ix).toBeCloseTo(207500, 0);
    });
    it("Wx_inf < Wx_sup (fibra inferior mais distante)", () => {
      // yInf = 28.33 > ySup = 50-28.33 = 21.67 → Wx_inf = Ix/yInf < Wx_sup = Ix/ySup
      expect(r.Wx_inf).toBeLessThan(r.Wx_sup);
    });
  });

  describe("poligonal (equivale a retângulo)", () => {
    it("retângulo via pontos reproduz b·h³/12", () => {
      const b = 20;
      const h = 50;
      const r = calcular({
        tipo: "poligonal",
        pontos: [
          { x: 0, y: 0 },
          { x: b, y: 0 },
          { x: b, y: h },
          { x: 0, y: h },
        ],
      });
      expect(r.A).toBeCloseTo(b * h, 6);
      expect(r.Ix).toBeCloseTo((b * h ** 3) / 12, 4);
    });

    it("aceita pontos em sentido horário (auto-corrige orientação)", () => {
      const b = 10;
      const h = 30;
      const horario = [
        { x: 0, y: 0 },
        { x: 0, y: h },
        { x: b, y: h },
        { x: b, y: 0 },
      ];
      const p = propsPoligono(horario);
      expect(p.A).toBeGreaterThan(0);
      expect(p.A).toBeCloseTo(b * h, 6);
      expect(p.Ix).toBeCloseTo((b * h ** 3) / 12, 4);
    });
  });

  describe("erros", () => {
    it("polígono com < 3 pontos lança", () => {
      expect(() => propsPoligono([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow();
    });
  });
});
