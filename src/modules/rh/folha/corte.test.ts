import { describe, it, expect } from "vitest";
import { CHAVE_CORTE_FOLHA, corteValido, motivoCorteFolha, motivoCorteReabrir } from "@/modules/rh/folha/corte";

describe("motivoCorteFolha", () => {
  it("competência anterior ao corte não fecha", () => {
    expect(motivoCorteFolha("2026-07", "2026-10")).toBe(
      "A folha de 07/2026 foi lançada no Financeiro pelo extrato. Fechar criaria as contas em dobro.",
    );
  });

  it("a competência do corte e as seguintes fecham", () => {
    expect(motivoCorteFolha("2026-10", "2026-10")).toBeNull();
    expect(motivoCorteFolha("2026-12", "2026-10")).toBeNull();
    expect(motivoCorteFolha("2027-01", "2026-10")).toBeNull();
  });

  it("sem corte configurado, tudo fecha", () => {
    expect(motivoCorteFolha("2026-07", null)).toBeNull();
  });

  it("virada de ano compara pelo ano", () => {
    expect(motivoCorteFolha("2025-12", "2026-01")).toBe(
      "A folha de 12/2025 foi lançada no Financeiro pelo extrato. Fechar criaria as contas em dobro.",
    );
  });
});

describe("motivoCorteReabrir", () => {
  it("folha anterior ao corte não reabre: ela não fecharia de novo", () => {
    expect(motivoCorteReabrir("2026-07", "2026-10")).toBe(
      "A folha de 07/2026 é anterior ao corte do Financeiro (lançada pelo extrato). Reaberta, ela não fecharia de novo.",
    );
  });

  it("a competência do corte em diante, ou sem corte, reabre", () => {
    expect(motivoCorteReabrir("2026-10", "2026-10")).toBeNull();
    expect(motivoCorteReabrir("2026-12", "2026-10")).toBeNull();
    expect(motivoCorteReabrir("2026-07", null)).toBeNull();
  });
});

describe("corteValido", () => {
  it("só aceita string YYYY-MM com mês de 01 a 12", () => {
    expect(CHAVE_CORTE_FOLHA).toBe("rh.folha.fechaNoFinanceiroDesde");
    expect(corteValido("2026-10")).toBe("2026-10");
    expect(corteValido("2026-13")).toBeNull();
    expect(corteValido("2026-1")).toBeNull();
    expect(corteValido(202610)).toBeNull();
    expect(corteValido(null)).toBeNull();
    expect(corteValido({ desde: "2026-10" })).toBeNull();
  });
});
