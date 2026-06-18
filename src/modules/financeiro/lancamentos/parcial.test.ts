import { describe, it, expect } from "vitest";
import { saldoRestante } from "./parcial";

describe("saldoRestante", () => {
  it("retorna a diferença num pagamento parcial", () => {
    expect(saldoRestante(20000, 5000)).toBe(15000);
    expect(saldoRestante(100.5, 40.25)).toBe(60.25);
  });
  it("null quando paga o total", () => {
    expect(saldoRestante(20000, 20000)).toBeNull();
  });
  it("null quando paga mais que o total", () => {
    expect(saldoRestante(20000, 25000)).toBeNull();
  });
  it("null quando não informa valor efetivo", () => {
    expect(saldoRestante(20000, null)).toBeNull();
    expect(saldoRestante(20000, undefined)).toBeNull();
  });
  it("ignora diferença menor que um centavo", () => {
    expect(saldoRestante(100, 99.999)).toBeNull();
  });
  it("arredonda a centavos", () => {
    expect(saldoRestante(10, 3.333)).toBe(6.67);
  });
});
