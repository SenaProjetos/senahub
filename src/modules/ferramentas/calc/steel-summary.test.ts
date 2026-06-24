import { describe, it, expect } from "vitest";
import { calcular } from "./steel-summary";

describe("E11 — Resumo de aço (NBR 7480)", () => {
  const r = calcular({
    itens: [
      { bitolaMm: 10, quantidade: 20, comprimentoM: 6 }, // 120 m
      { bitolaMm: 10, quantidade: 10, comprimentoM: 4 }, // +40 m → 160 m
      { bitolaMm: 12.5, quantidade: 8, comprimentoM: 5 }, // 40 m
    ],
    perdaPct: 10,
  });

  it("agrupa por bitola", () => {
    expect(r.porBitola).toHaveLength(2);
    const b10 = r.porBitola.find((l) => l.bitolaMm === 10)!;
    expect(b10.comprimentoTotalM).toBeCloseTo(160, 3);
    expect(b10.quantidade).toBe(30);
  });

  it("peso ø10 (160 m) ≈ 98.65 kg", () => {
    // massa linear ø10 ≈ 0.6166 kg/m → 160·0.6166
    const b10 = r.porBitola.find((l) => l.bitolaMm === 10)!;
    expect(b10.pesoKg).toBeCloseTo(98.65, 1);
  });

  it("peso ø12.5 (40 m) ≈ 38.53 kg", () => {
    const b125 = r.porBitola.find((l) => l.bitolaMm === 12.5)!;
    expect(b125.pesoKg).toBeCloseTo(38.53, 1);
  });

  it("total e total com perda (10%)", () => {
    expect(r.pesoTotalKg).toBeCloseTo(98.65 + 38.53, 0);
    expect(r.pesoComPerdaKg).toBeCloseTo(r.pesoTotalKg * 1.1, 3);
  });
});
