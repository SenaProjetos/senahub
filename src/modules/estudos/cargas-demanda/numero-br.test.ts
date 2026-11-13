import { describe, expect, it } from "vitest";

import { formatarNumeroBR, lerNumeroBR } from "./numero-br";

describe("lerNumeroBR", () => {
  it("vírgula é o decimal", () => {
    expect(lerNumeroBR("1,5")).toBe(1.5);
    expect(lerNumeroBR("0,80")).toBe(0.8);
    expect(lerNumeroBR(" 12 ")).toBe(12);
  });

  it("ponto como decimal ou como milhar", () => {
    expect(lerNumeroBR("1.5")).toBe(1.5);
    expect(lerNumeroBR("12.5")).toBe(12.5);
    expect(lerNumeroBR("1.234")).toBe(1234);
    expect(lerNumeroBR("1.234,56")).toBe(1234.56);
    expect(lerNumeroBR("1.234.567")).toBe(1234567);
  });

  it("vazio é null; lixo é undefined", () => {
    expect(lerNumeroBR("")).toBeNull();
    expect(lerNumeroBR("   ")).toBeNull();
    expect(lerNumeroBR("abc")).toBeUndefined();
    expect(lerNumeroBR("1,2,3")).toBeUndefined();
    expect(lerNumeroBR("1.2.3")).toBeUndefined();
  });

  it("aceita a vírgula solta no meio da digitação", () => {
    expect(lerNumeroBR("1,")).toBe(1);
    expect(lerNumeroBR("-2,5")).toBe(-2.5);
  });
});

describe("formatarNumeroBR", () => {
  it("mostra as casas pedidas e não corta precisão", () => {
    expect(formatarNumeroBR(1, 2)).toBe("1,00");
    expect(formatarNumeroBR(0.8, 2)).toBe("0,80");
    expect(formatarNumeroBR(0.737, 2)).toBe("0,737");
    expect(formatarNumeroBR(1234.5, 2)).toBe("1.234,50");
    expect(lerNumeroBR(formatarNumeroBR(1234.5, 2))).toBe(1234.5);
    expect(formatarNumeroBR(24, 0)).toBe("24");
  });

  it("vazio quando não há valor", () => {
    expect(formatarNumeroBR(null)).toBe("");
    expect(formatarNumeroBR(undefined)).toBe("");
    expect(formatarNumeroBR(Number.NaN)).toBe("");
  });
});
