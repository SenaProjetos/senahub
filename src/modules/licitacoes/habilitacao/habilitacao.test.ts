import { describe, it, expect } from "vitest";
import { itemAtendido } from "./habilitacao";

describe("itemAtendido", () => {
  it("retorna true quando atendido=true, mesmo sem certidão", () => {
    expect(itemAtendido({ atendido: true, certidaoValidadeISO: null }, "2026-06-19")).toBe(true);
  });

  it("retorna false quando atendido=false e sem certidão", () => {
    expect(itemAtendido({ atendido: false, certidaoValidadeISO: null }, "2026-06-19")).toBe(false);
  });

  it("retorna true quando certidão ainda é válida (validade > ref)", () => {
    expect(
      itemAtendido({ atendido: false, certidaoValidadeISO: "2026-12-31" }, "2026-06-19"),
    ).toBe(true);
  });

  it("retorna false quando certidão expirou (validade < ref)", () => {
    expect(
      itemAtendido({ atendido: false, certidaoValidadeISO: "2026-01-01" }, "2026-06-19"),
    ).toBe(false);
  });

  it("retorna true quando atendido=true mesmo com certidão expirada (manual prevalece)", () => {
    expect(
      itemAtendido({ atendido: true, certidaoValidadeISO: "2026-01-01" }, "2026-06-19"),
    ).toBe(true);
  });

  it("retorna true quando certidão vence exatamente na data de referência (igual = válida)", () => {
    expect(
      itemAtendido({ atendido: false, certidaoValidadeISO: "2026-06-19" }, "2026-06-19"),
    ).toBe(true);
  });
});
