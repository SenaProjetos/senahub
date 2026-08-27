import { describe, expect, it } from "vitest";
import { faixaTemPeriodoValido, faixasSeSobrepoem, haConflitoDeFaixa } from "./alocacao-faixas";

describe("faixas de alocação", () => {
  it("aceita retorno ao mesmo projeto depois do encerramento da faixa anterior", () => {
    expect(faixasSeSobrepoem(
      { inicio: "2026-01-01", fim: "2026-03-31" },
      { inicio: "2026-09-01", fim: "2026-12-31" },
    )).toBe(false);
  });

  it("considera conflitante o dia de limite compartilhado", () => {
    expect(faixasSeSobrepoem(
      { inicio: "2026-01-01", fim: "2026-03-31" },
      { inicio: "2026-03-31", fim: "2026-06-30" },
    )).toBe(true);
  });

  it("preserva a semântica da faixa legada sem início", () => {
    expect(haConflitoDeFaixa(
      { inicio: "2026-09-01", fim: "2026-12-31" },
      [{ id: "legada", inicio: null, fim: null }],
    )).toBe(true);
  });

  it("ignora a própria faixa e rejeita um período invertido", () => {
    const propria = { id: "a1", inicio: "2026-01-01", fim: "2026-03-31" };
    expect(haConflitoDeFaixa(propria, [propria])).toBe(false);
    expect(faixaTemPeriodoValido({ inicio: "2026-04-01", fim: "2026-03-31" })).toBe(false);
  });
});
