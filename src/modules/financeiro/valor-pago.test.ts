import { describe, expect, it } from "vitest";
import { somaPaga, valorPagoCentavos } from "@/modules/financeiro/valor-pago";

describe("valor pago", () => {
  it("o pago vence o nominal; sem pago, vale o nominal", () => {
    expect(valorPagoCentavos({ valor: "1000.00", valorEfetivo: "950.50" })).toBe(95_050);
    expect(valorPagoCentavos({ valor: "1000.00", valorEfetivo: null })).toBe(100_000);
  });

  it("A11: um lançamento com pago não faz a soma ignorar os outros (o atalho _sum.valorEfetivo ?? _sum.valor erra)", () => {
    const linhas = [
      { valor: "1000.00", valorEfetivo: "900.00" },
      { valor: "500.00", valorEfetivo: null },
    ];
    // _sum.valorEfetivo = 900 → o atalho devolvia 900; o certo é 900 + 500.
    expect(somaPaga(linhas)).toBe(1400);
  });

  it("soma em centavos, sem erro de ponto flutuante", () => {
    expect(somaPaga([{ valor: 0.1, valorEfetivo: null }, { valor: 0.2, valorEfetivo: null }])).toBe(0.3);
    expect(somaPaga([])).toBe(0);
  });
});

import { somarReais, valorPagoReais } from "@/modules/financeiro/valor-pago";

describe("valorPagoReais / somarReais", () => {
  it("valor pago exato em 2 casas", () => {
    expect(valorPagoReais({ valor: "1000.10", valorEfetivo: "0.30" })).toBe(0.3);
    expect(valorPagoReais({ valor: 19.9, valorEfetivo: null })).toBe(19.9);
  });
  it("somar não deriva: 0,1 + 0,2 = 0,3 e 1000 × 0,01 fecha", () => {
    expect(somarReais(0.1, 0.2)).toBe(0.3);
    let acc = 0;
    for (let i = 0; i < 1000; i++) acc = somarReais(acc, 0.01);
    expect(acc).toBe(10);
  });
});
