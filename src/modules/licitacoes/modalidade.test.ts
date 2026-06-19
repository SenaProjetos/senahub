import { describe, it, expect } from "vitest";
import { modalidadePermitida } from "./modalidade";

describe("modalidadePermitida", () => {
  const ativas = ["Pregão", "Concorrência", "Dispensa"];

  it("aceita vazio/nulo (modalidade é opcional)", () => {
    expect(modalidadePermitida("", ativas)).toBe(true);
    expect(modalidadePermitida(null, ativas)).toBe(true);
    expect(modalidadePermitida(undefined, ativas)).toBe(true);
  });

  it("aceita nome presente na lista", () => {
    expect(modalidadePermitida("Pregão", ativas)).toBe(true);
    expect(modalidadePermitida("Dispensa", ativas)).toBe(true);
  });

  it("rejeita nome fora da lista", () => {
    expect(modalidadePermitida("Leilão", ativas)).toBe(false);
  });

  it("é case-sensitive (match exato)", () => {
    expect(modalidadePermitida("pregão", ativas)).toBe(false);
  });
});
