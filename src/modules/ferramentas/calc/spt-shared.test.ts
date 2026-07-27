import { describe, it, expect } from "vitest";
import { camadaSptSchema, nMedioPonderado, camadasAteProfundidade, SOLOS } from "./spt-shared";

describe("spt-shared", () => {
  it("valida uma camada de SPT", () => {
    expect(() => camadaSptSchema.parse({ solo: "argila_arenosa", nspt: 10, espessuraM: 2 })).not.toThrow();
    expect(() => camadaSptSchema.parse({ solo: "inexistente", nspt: 10, espessuraM: 2 })).toThrow();
    expect(() => camadaSptSchema.parse({ solo: "areia", nspt: 10, espessuraM: 0 })).toThrow();
  });

  it("N médio ponderado pela espessura", () => {
    const n = nMedioPonderado([
      { solo: "areia", nspt: 10, espessuraM: 1 },
      { solo: "areia", nspt: 20, espessuraM: 3 },
    ]);
    expect(n).toBeCloseTo((10 * 1 + 20 * 3) / 4, 6);
  });

  it("N médio de perfil vazio é 0 (sem divisão por zero)", () => {
    expect(nMedioPonderado([])).toBe(0);
  });

  it("expõe a tabela de solos", () => {
    expect(SOLOS.argila.K).toBeGreaterThan(0);
    expect(Object.keys(SOLOS)).toHaveLength(9);
  });

  it("recorta o perfil até uma profundidade, fatiando a camada de borda", () => {
    const perfil = [
      { solo: "areia", nspt: 5, espessuraM: 2 },
      { solo: "argila", nspt: 15, espessuraM: 3 },
    ] as const;
    const r = camadasAteProfundidade([...perfil], 3.5);
    expect(r).toHaveLength(2);
    expect(r[0].espessuraM).toBeCloseTo(2, 6);
    expect(r[1].espessuraM).toBeCloseTo(1.5, 6); // camada de borda cortada
  });

  it("perfil mais curto que o limite retorna todas as camadas", () => {
    const r = camadasAteProfundidade([{ solo: "areia", nspt: 5, espessuraM: 2 }], 10);
    expect(r).toHaveLength(1);
    expect(r[0].espessuraM).toBe(2);
  });
});
