import { describe, it, expect } from "vitest";
import { calcular, parametrosConcreto, rhoMin } from "./concrete-beam-flexure";

describe("E01 — Viga à flexão (NBR 6118:2023)", () => {
  describe("parâmetros do concreto", () => {
    it("fck ≤ 50: λ=0.8, αc=0.85, x/d lim=0.45", () => {
      const p = parametrosConcreto(25);
      expect(p.lambda).toBe(0.8);
      expect(p.alphaC).toBe(0.85);
      expect(p.epsCU).toBeCloseTo(0.0035, 6);
      expect(p.xLimRatio).toBe(0.45);
    });
    it("fck=60: λ e αc reduzidos, x/d lim=0.35", () => {
      const p = parametrosConcreto(60);
      expect(p.lambda).toBeCloseTo(0.775, 6); // 0.8 - 10/400
      expect(p.alphaC).toBeCloseTo(0.8075, 6); // 0.85·(1 - 10/200)
      expect(p.xLimRatio).toBe(0.35);
    });
  });

  describe("ρ_mín", () => {
    it("C25 → 0.15%", () => expect(rhoMin(25)).toBeCloseTo(0.15, 4));
    it("C50 → 0.208%", () => expect(rhoMin(50)).toBeCloseTo(0.208, 4));
  });

  // Vetor conferido à mão: b=20, h=50, d=46, fck=25, CA-50, Mk=100, γf=1.4 → Md=14000 kN·cm.
  describe("retangular — armadura simples (hand-check)", () => {
    const r = calcular({
      secao: { forma: "retangular", b: 20, h: 50 },
      d: 46,
      fck: 25,
      aco: "CA-50",
      Mk: 100,
    });
    it("x ≈ 14.31 cm", () => expect(r.x).toBeCloseTo(14.31, 1));
    it("x/d ≈ 0.311 (domínio 3)", () => {
      expect(r.xd).toBeCloseTo(0.311, 2);
      expect(r.dominio).toBe("3");
    });
    it("As ≈ 7.99 cm², sem armadura dupla", () => {
      expect(r.As).toBeCloseTo(7.99, 1);
      expect(r.dupla).toBe(false);
      expect(r.AsLinha).toBe(0);
    });
    it("situação ok", () => expect(r.situacao).toBe("ok"));
  });

  // Mesma seção, Mk=160 → Md=22400 kN·cm > M1(≈18964) → armadura dupla.
  describe("retangular — armadura dupla (hand-check)", () => {
    const r = calcular({
      secao: { forma: "retangular", b: 20, h: 50 },
      d: 46,
      dLinha: 4,
      fck: 25,
      aco: "CA-50",
      Mk: 160,
    });
    it("aciona armadura dupla", () => expect(r.dupla).toBe(true));
    it("As' ≈ 1.88 cm²", () => expect(r.AsLinha).toBeCloseTo(1.88, 1));
    it("As ≈ 13.44 cm²", () => expect(r.As).toBeCloseTo(13.44, 1));
    it("x no limite (x/d ≈ 0.45)", () => expect(r.xd).toBeCloseTo(0.45, 2));
  });

  // Seção T: bf=50, hf=10, bw=15, h=60, d=55, fck=25, CA-50, Mk=300 → LN na alma.
  describe("seção T — LN na alma (hand-check)", () => {
    const r = calcular({
      secao: { forma: "T", bf: 50, hf: 10, bw: 15, h: 60 },
      d: 55,
      fck: 25,
      aco: "CA-50",
      Mk: 300,
    });
    it("não é caso de mesa (LN na alma)", () => expect(r.tSecaoMesa).toBe(false));
    it("As ≈ 19.6 cm²", () => expect(r.As).toBeCloseTo(19.6, 0));
    it("x ≈ 17.68 cm e λx > hf", () => {
      expect(r.x).toBeCloseTo(17.68, 0);
      expect(r.params.lambda * r.x).toBeGreaterThan(10);
    });
  });

  describe("seção T — LN na mesa (comporta-se como retangular bf)", () => {
    const r = calcular({
      secao: { forma: "T", bf: 50, hf: 10, bw: 15, h: 60 },
      d: 55,
      fck: 25,
      aco: "CA-50",
      Mk: 100, // momento baixo → bloco dentro da mesa
    });
    it("LN na mesa", () => expect(r.tSecaoMesa).toBe(true));
    it("λx ≤ hf", () => expect(r.params.lambda * r.x).toBeLessThanOrEqual(10 + 1e-6));
  });

  describe("As,mín e As,máx", () => {
    it("momento baixo → alerta de As < As,mín", () => {
      const r = calcular({
        secao: { forma: "retangular", b: 20, h: 50 },
        d: 46,
        fck: 25,
        aco: "CA-50",
        Mk: 10,
      });
      expect(r.AsMin).toBeCloseTo((0.15 / 100) * 20 * 50, 3); // 1.5 cm²
      expect(r.alertas.some((a) => /As,m[íi]n/i.test(a))).toBe(true);
    });
  });
});
