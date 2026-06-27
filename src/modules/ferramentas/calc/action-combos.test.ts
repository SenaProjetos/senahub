import { describe, it, expect } from "vitest";
import { calcular } from "./action-combos";

describe("E14 — Combinações de ações (NBR 8681:2003)", () => {
  // Hand-check:
  // Permanentes: G1=100, G2=50 (ambas desfavoráveis) → ΣGk=150
  // Variáveis: Q1=80 comercial (ψ0=0.7, ψ1=0.6, ψ2=0.4); Q2=40 vento (ψ0=0.6, ψ1=0.3, ψ2=0.0)
  const entrada = {
    permanentes: [
      { nome: "Peso próprio", gk: 100, favoravel: false },
      { nome: "Revestimento", gk: 50, favoravel: false },
    ],
    variaveis: [
      { nome: "Sobrecarga", qk: 80, tipo: "comercial" as const },
      { nome: "Vento", qk: 40, tipo: "vento" as const },
    ],
  };

  describe("ELU normal (γg=1.4, γq=1.4)", () => {
    const r = calcular(entrada);
    it("principal Sobrecarga: Fd = 355.6", () => {
      const c = r.elu.normal.combinacoes.find((x) => x.principal === "Sobrecarga");
      expect(c?.fd).toBeCloseTo(355.6, 1); // 210 + 1.4·(80 + 0.6·40)
    });
    it("principal Vento: Fd = 344.4", () => {
      const c = r.elu.normal.combinacoes.find((x) => x.principal === "Vento");
      expect(c?.fd).toBeCloseTo(344.4, 1); // 210 + 1.4·(40 + 0.7·80)
    });
    it("governante = 355.6 (Sobrecarga)", () => {
      expect(r.elu.normal.governante.fd).toBeCloseTo(355.6, 1);
      expect(r.elu.normal.governante.principal).toBe("Sobrecarga");
    });
  });

  describe("ELU especial (γg=1.3, γq=1.2) e excepcional (γg=1.2, γq=1.0)", () => {
    const r = calcular(entrada);
    it("especial governante = 319.8", () => {
      // sumG=1.3·150=195; +1.2·(80+0.6·40)=+124.8 → 319.8
      expect(r.elu.especial.governante.fd).toBeCloseTo(319.8, 1);
    });
    it("excepcional governante = 284.0", () => {
      // sumG=1.2·150=180; +1.0·(80+0.6·40)=+104 → 284
      expect(r.elu.excepcional.governante.fd).toBeCloseTo(284.0, 1);
    });
  });

  describe("ELS", () => {
    const r = calcular(entrada);
    it("quase-permanente = 182 (ΣGk + ψ2·Q)", () => {
      // 150 + 0.4·80 + 0.0·40 = 182
      expect(r.els.quasePermanente.fd).toBeCloseTo(182, 6);
    });
    it("frequente governante = 198", () => {
      // principal Sobrecarga: 150 + 0.6·80 + 0.0·40 = 198
      expect(r.els.frequente.governante.fd).toBeCloseTo(198, 1);
    });
    it("rara governante = 242", () => {
      // principal Sobrecarga: 150 + 80 + 0.3·40 = 242
      expect(r.els.rara.governante.fd).toBeCloseTo(242, 1);
    });
  });

  describe("Casos de borda", () => {
    it("permanente favorável usa γg=1.0", () => {
      const r = calcular({
        permanentes: [{ nome: "PP", gk: 100, favoravel: true }],
        variaveis: [],
      });
      expect(r.elu.normal.governante.fd).toBeCloseTo(100, 6); // 1.0·100, sem variáveis
    });
    it("sem variáveis: ELU normal = ΣγgGk", () => {
      const r = calcular({ permanentes: [{ nome: "PP", gk: 100, favoravel: false }], variaveis: [] });
      expect(r.elu.normal.governante.fd).toBeCloseTo(140, 6); // 1.4·100
      expect(r.els.quasePermanente.fd).toBeCloseTo(100, 6); // ΣGk
    });
    it("uma única variável: governante é ela", () => {
      const r = calcular({
        permanentes: [{ nome: "PP", gk: 100, favoravel: false }],
        variaveis: [{ nome: "Q", qk: 50, tipo: "residencial" }],
      });
      // ELU normal: 140 + 1.4·50 = 210 (sem secundárias)
      expect(r.elu.normal.governante.fd).toBeCloseTo(210, 6);
      // rara: 100 + 50 = 150
      expect(r.els.rara.governante.fd).toBeCloseTo(150, 6);
    });
  });
});
