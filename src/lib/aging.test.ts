import { describe, it, expect } from "vitest";
import { calcularAging } from "./aging";

const hoje = new Date("2026-06-14T00:00:00Z");
function venc(diasAtras: number): Date {
  const d = new Date(hoje);
  d.setDate(d.getDate() - diasAtras);
  return d;
}

describe("calcularAging", () => {
  it("vencimento futuro = a_vencer", () => {
    expect(calcularAging(venc(-17), hoje)).toEqual({ faixa: "a_vencer", diasAtraso: 0 });
  });
  it("hoje = a_vencer (0 dias)", () => {
    expect(calcularAging(venc(0), hoje).faixa).toBe("a_vencer");
  });
  it("10 dias de atraso = d1_30", () => {
    expect(calcularAging(venc(10), hoje)).toEqual({ faixa: "d1_30", diasAtraso: 10 });
  });
  it("45 dias = d31_60", () => {
    expect(calcularAging(venc(45), hoje).faixa).toBe("d31_60");
  });
  it("borda 90 = d61_90; 91 = d91_120", () => {
    expect(calcularAging(venc(90), hoje).faixa).toBe("d61_90");
    expect(calcularAging(venc(91), hoje).faixa).toBe("d91_120");
  });
  it("muito vencido = d120_mais", () => {
    expect(calcularAging(venc(200), hoje).faixa).toBe("d120_mais");
  });
});
