import { describe, it, expect } from "vitest";
import { intervalosSobrepoem, excedeTetoSubcontratacao } from "./conflito";

describe("intervalosSobrepoem", () => {
  it("caso 1: overlap real (a e b se sobrepõem)", () => {
    expect(intervalosSobrepoem("2026-01-01", "2026-06-30", "2026-05-01", "2026-12-31")).toBe(true);
  });

  it("caso 2: sem overlap (a termina antes de b começar)", () => {
    expect(intervalosSobrepoem("2026-01-01", "2026-03-31", "2026-04-01", "2026-06-30")).toBe(false);
  });

  it("caso 3: a aberto (sem fim) cobre b futuro", () => {
    expect(intervalosSobrepoem("2026-01-01", null, "2030-01-01", null)).toBe(true);
  });

  it("caso 4: tocam exatamente no limite (2026-06-30 == 2026-06-30)", () => {
    expect(intervalosSobrepoem("2026-01-01", "2026-06-30", "2026-06-30", "2026-12-31")).toBe(true);
  });

  it("caso 5: a totalmente aberto (null/null)", () => {
    expect(intervalosSobrepoem(null, null, "2026-01-01", "2026-06-30")).toBe(true);
  });
});

describe("excedeTetoSubcontratacao", () => {
  it("caso 6: 20+10=30 > 25 — excede", () => {
    expect(excedeTetoSubcontratacao(20, 10, 25)).toBe(true);
  });

  it("caso 7: 15+10=25 == 25 — não excede (igual não é excesso)", () => {
    expect(excedeTetoSubcontratacao(15, 10, 25)).toBe(false);
  });

  it("caso 8: sem teto (null) — nunca excede", () => {
    expect(excedeTetoSubcontratacao(50, 50, null)).toBe(false);
  });
});
