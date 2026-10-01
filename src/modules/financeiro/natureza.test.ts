import { describe, expect, it } from "vitest";
import { classificarMovimento, foraDoResultado } from "@/modules/financeiro/natureza";

describe("natureza do movimento (spec §8, ADR-0008)", () => {
  it("pró-labore (resultado): despesa + saída de caixa + DRE + DFC + dias de caixa", () => {
    expect(classificarMovimento("resultado")).toEqual({
      entraNoCaixa: true,
      entraNoResultado: true,
      entraNoDfc: true,
      entraNosTotaisDoPlanejador: true,
      entraEmDiasDeCaixa: true,
    });
    expect(foraDoResultado("resultado")).toBe(false);
  });

  it("distribuição de lucros (fora do resultado): sai do caixa e entra no DFC, mas NÃO é despesa da DRE", () => {
    expect(classificarMovimento("fora_do_resultado")).toEqual({
      entraNoCaixa: true,
      entraNoResultado: false,
      entraNoDfc: true,
      entraNosTotaisDoPlanejador: true,
      entraEmDiasDeCaixa: false,
    });
    expect(foraDoResultado("fora_do_resultado")).toBe(true);
  });

  it("transferência: muda o saldo de cada conta e nada mais", () => {
    expect(classificarMovimento("transferencia")).toEqual({
      entraNoCaixa: true,
      entraNoResultado: false,
      entraNoDfc: false,
      entraNosTotaisDoPlanejador: false,
      entraEmDiasDeCaixa: false,
    });
    expect(foraDoResultado("transferencia")).toBe(true);
  });
});
