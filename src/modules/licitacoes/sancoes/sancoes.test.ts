import { describe, it, expect } from "vitest";
import { sancaoAtiva } from "./sancoes";

describe("sancaoAtiva", () => {
  it("retorna true quando inicio e fim são null (aberto/sem limite)", () => {
    expect(sancaoAtiva({ inicio: null, fim: null }, "2026-06-19")).toBe(true);
  });

  it("retorna true quando hoje está dentro do período inicio–fim", () => {
    expect(sancaoAtiva({ inicio: "2026-01-01", fim: "2026-12-31" }, "2026-06-19")).toBe(true);
  });

  it("retorna false quando inicio é futuro (sanção ainda não começou)", () => {
    expect(sancaoAtiva({ inicio: "2026-07-01", fim: null }, "2026-06-19")).toBe(false);
  });

  it("retorna false quando fim já passou (sanção terminou)", () => {
    expect(sancaoAtiva({ inicio: null, fim: "2026-05-01" }, "2026-06-19")).toBe(false);
  });

  it("retorna true nos limites exatos (inicio === hoje && fim === hoje)", () => {
    expect(sancaoAtiva({ inicio: "2026-06-19", fim: "2026-06-19" }, "2026-06-19")).toBe(true);
  });

  it("retorna false quando inicio é amanhã (caso 6 do brief)", () => {
    expect(sancaoAtiva({ inicio: "2026-06-20", fim: null }, "2026-06-19")).toBe(false);
  });
});
