import { describe, it, expect } from "vitest";
import { devePassarPorAprovacao } from "./aprovacao";

describe("devePassarPorAprovacao", () => {
  describe("despesas", () => {
    it("exige aprovação quando valor >= limite (> 0)", () => {
      expect(devePassarPorAprovacao("despesa", 1000, 1000)).toBe(true);
      expect(devePassarPorAprovacao("despesa", 1500, 1000)).toBe(true);
    });

    it("dispensa aprovação quando valor < limite", () => {
      expect(devePassarPorAprovacao("despesa", 999, 1000)).toBe(false);
    });

    it("dispensa aprovação quando limite é 0 (alçada desativada)", () => {
      expect(devePassarPorAprovacao("despesa", 9999, 0)).toBe(false);
    });

    it("dispensa aprovação para valor zero", () => {
      expect(devePassarPorAprovacao("despesa", 0, 500)).toBe(false);
    });
  });

  describe("receitas", () => {
    it("nunca exige aprovação (somente despesas)", () => {
      expect(devePassarPorAprovacao("receita", 100000, 100)).toBe(false);
      expect(devePassarPorAprovacao("receita", 50000, 0)).toBe(false);
    });
  });
});
