import { describe, it, expect } from "vitest";
import { formatarNumeroProposta } from "./numeracao";

describe("formatarNumeroProposta", () => {
  it("formata ano e sequencial simples", () => {
    expect(formatarNumeroProposta(2026, 1)).toBe("PR-260001");
  });

  it("preenche o sequencial com zeros à esquerda até 4 dígitos", () => {
    expect(formatarNumeroProposta(2026, 42)).toBe("PR-260042");
    expect(formatarNumeroProposta(2026, 999)).toBe("PR-260999");
  });

  it("virada de ano: cada ano tem prefixo próprio, sem colidir", () => {
    expect(formatarNumeroProposta(2026, 9999)).toBe("PR-269999");
    expect(formatarNumeroProposta(2027, 1)).toBe("PR-270001");
  });

  it("sequencial >= 10000 cresce em vez de truncar ou colidir", () => {
    expect(formatarNumeroProposta(2026, 10000)).toBe("PR-2610000");
    expect(formatarNumeroProposta(2026, 12345)).toBe("PR-2612345");
  });

  it("ano com 4 dígitos usa só os 2 últimos", () => {
    expect(formatarNumeroProposta(2100, 1)).toBe("PR-000001");
    expect(formatarNumeroProposta(2000, 1)).toBe("PR-000001");
  });
});
