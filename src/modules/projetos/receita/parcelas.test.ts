import { describe, it, expect } from "vitest";
import { dividirEmParcelas, ehParcelaGerada, saldoAParcelar } from "@/modules/projetos/receita/parcelas";

describe("dividirEmParcelas", () => {
  it("divide igualmente quando exato", () => {
    expect(dividirEmParcelas(900, 3)).toEqual([300, 300, 300]);
  });

  it("coloca os centavos restantes na primeira parcela", () => {
    const p = dividirEmParcelas(1000, 3);
    expect(p).toEqual([333.34, 333.33, 333.33]);
    expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(1000, 2);
  });

  it("soma sempre igual ao total", () => {
    for (const [total, n] of [[1234.56, 7], [99.99, 4], [50000, 12], [10, 3]] as const) {
      const soma = dividirEmParcelas(total, n).reduce((s, v) => s + v, 0);
      expect(soma).toBeCloseTo(total, 2);
    }
  });

  it("parcela única devolve o total", () => {
    expect(dividirEmParcelas(777.77, 1)).toEqual([777.77]);
  });

  it("n inválido devolve vazio", () => {
    expect(dividirEmParcelas(100, 0)).toEqual([]);
  });
});

describe("ehParcelaGerada (A6)", () => {
  it("parcela gerada e o resto do parcial dela: sim", () => {
    expect(ehParcelaGerada(["contrato"])).toBe(true);
    expect(ehParcelaGerada(["contrato", "outra"])).toBe(true);
  });
  it("faturamento por entrega leva 'contrato' mas NÃO é parcela gerada", () => {
    expect(ehParcelaGerada(["contrato", "entrega:disc-1"])).toBe(false);
  });
  it("sem a tag: não", () => {
    expect(ehParcelaGerada([])).toBe(false);
    expect(ehParcelaGerada(["reembolso-art"])).toBe(false);
  });
});

describe("saldoAParcelar (A6)", () => {
  it("desconta o que já foi recebido", () => {
    expect(saldoAParcelar(1_000_000, 0)).toBe(1_000_000);
    expect(saldoAParcelar(1_000_000, 300_000)).toBe(700_000);
  });
  it("recebido igual ou acima do total: nada a parcelar", () => {
    expect(saldoAParcelar(1_000_000, 1_000_000)).toBeNull();
    expect(saldoAParcelar(1_000_000, 1_200_000)).toBeNull();
  });
});
