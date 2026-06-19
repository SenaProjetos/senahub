import { describe, it, expect } from "vitest";
import { totalComposicao, subtotalItem } from "./composicao";

describe("totalComposicao", () => {
  it("retorna 0 para lista vazia", () => {
    expect(totalComposicao([])).toBe(0);
  });

  it("retorna produto de um item", () => {
    expect(totalComposicao([{ quantidade: 2, valorUnitario: 10 }])).toBe(20);
  });

  it("soma múltiplos itens com decimais", () => {
    expect(
      totalComposicao([
        { quantidade: 1.5, valorUnitario: 10 },
        { quantidade: 3, valorUnitario: 5.5 },
      ]),
    ).toBe(31.5);
  });

  it("arredonda corretamente floating-point (0.1 × 3)", () => {
    expect(totalComposicao([{ quantidade: 3, valorUnitario: 0.1 }])).toBe(0.3);
  });
});

describe("subtotalItem", () => {
  it("arredonda floating-point (3 × 0.1)", () => {
    expect(subtotalItem({ quantidade: 3, valorUnitario: 0.1 })).toBe(0.3);
  });

  it("calcula subtotal simples (2.5 × 4)", () => {
    expect(subtotalItem({ quantidade: 2.5, valorUnitario: 4 })).toBe(10);
  });
});
