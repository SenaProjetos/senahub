import { describe, expect, it } from "vitest";
import { custoHorasDoProjeto } from "./custo-horas";

describe("custoHorasDoProjeto (decisão 18: meses abertos entram como estimativa)", () => {
  it("soma o fechado e a estimativa dos meses abertos; mês aberto sem custo não aparece", () => {
    expect(custoHorasDoProjeto({ fechadasCent: 300000, abertosCent: { "2026-11": 0, "2026-10": 80000, "2026-12": 15000 } })).toEqual({
      fechadasCent: 300000,
      estimativaCent: 95000,
      mesesEstimados: ["2026-10", "2026-12"],
      totalCent: 395000,
    });
  });
  it("sem mês aberto: só o fechado", () => {
    expect(custoHorasDoProjeto({ fechadasCent: 1000, abertosCent: {} })).toEqual({ fechadasCent: 1000, estimativaCent: 0, mesesEstimados: [], totalCent: 1000 });
  });
});
