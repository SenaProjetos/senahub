import { describe, expect, it } from "vitest";
import { CONFIG_LIQUIDEZ_PADRAO, configLiquidezSchema, normalizarConfigLiquidez } from "@/modules/financeiro/config/liquidez";

describe("config do planejador (financeiro.liquidez)", () => {
  it("sem nada gravado volta ao padrão: sem reserva, 30 dias, incerta após 30 dias", () => {
    expect(normalizarConfigLiquidez(null)).toEqual({ reservaMinima: 0, horizontePadraoDias: 30, diasParaIncerta: 30 });
    expect(normalizarConfigLiquidez("lixo")).toEqual(CONFIG_LIQUIDEZ_PADRAO);
  });

  it("aproveita o que é válido e troca só o inválido pelo padrão", () => {
    expect(normalizarConfigLiquidez({ reservaMinima: 3_000_000, horizontePadraoDias: 45, diasParaIncerta: 400 })).toEqual({
      reservaMinima: 3_000_000,
      horizontePadraoDias: 30,
      diasParaIncerta: 30,
    });
    expect(normalizarConfigLiquidez({ reservaMinima: -1, horizontePadraoDias: 90, diasParaIncerta: 15 })).toEqual({
      reservaMinima: 0,
      horizontePadraoDias: 90,
      diasParaIncerta: 15,
    });
  });

  it("o esquema da action aceita só 30, 60, 90 ou 180 dias e reserva em centavos inteiros", () => {
    expect(configLiquidezSchema.safeParse({ reservaMinima: 3_000_000, horizontePadraoDias: 180, diasParaIncerta: 30 }).success).toBe(true);
    expect(configLiquidezSchema.safeParse({ reservaMinima: 3_000_000, horizontePadraoDias: 120, diasParaIncerta: 30 }).success).toBe(false);
    expect(configLiquidezSchema.safeParse({ reservaMinima: 10.5, horizontePadraoDias: 30, diasParaIncerta: 30 }).success).toBe(false);
  });
});
