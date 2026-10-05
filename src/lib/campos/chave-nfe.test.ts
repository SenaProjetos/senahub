import { describe, expect, it } from "vitest";
import { chaveNfe, chaveNfeValida } from "./chave-nfe";

// Chave com DV correto, a mesma usada em financeiro/lancamentos/baixa.test.ts.
const CHAVE = "35200714200166000187550010000000046550010007";

describe("chaveNfe", () => {
  it("mascara em grupos de 4 só para exibir", () => {
    expect(chaveNfe.mascarar("35240312")).toBe("3524 0312");
    expect(chaveNfe.mascarar(CHAVE).replace(/\s/g, "")).toBe(CHAVE);
  });
  it("grava os 44 dígitos corridos", () => {
    expect(chaveNfe.normalizar(chaveNfe.mascarar(CHAVE))).toBe(CHAVE);
  });
  it("valida pelo módulo 11; vazio é válido", () => {
    expect(chaveNfe.validar("")).toBe(true);
    expect(chaveNfe.validar("123")).toBe(false);
    expect(chaveNfeValida(CHAVE)).toBe(chaveNfe.validar(CHAVE));
    expect(chaveNfe.validar(CHAVE)).toBe(true);
  });
});
