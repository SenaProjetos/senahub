import { describe, it, expect } from "vitest";
import { temValorPagavel, separarPagaveis } from "@/modules/financeiro/folha/service";

/** Imita o Decimal do Prisma: objeto cujo `toString()` devolve o valor. */
const dec = (s: string) => ({ toString: () => s });

describe("temValorPagavel", () => {
  it("recusa zero", () => {
    expect(temValorPagavel(0)).toBe(false);
  });
  it("recusa Decimal zerado vindo do banco", () => {
    expect(temValorPagavel(dec("0.00"))).toBe(false);
  });
  it("recusa valor negativo", () => {
    expect(temValorPagavel(-10)).toBe(false);
  });
  it("aceita o menor valor positivo", () => {
    expect(temValorPagavel(0.01)).toBe(true);
  });
  it("aceita Decimal positivo vindo do banco", () => {
    expect(temValorPagavel(dec("1800.00"))).toBe(true);
  });
});

describe("separarPagaveis", () => {
  it("separa as linhas zeradas das pagáveis, preservando a ordem", () => {
    const r = separarPagaveis([
      { id: "a", valor: 100 },
      { id: "b", valor: 0 },
      { id: "c", valor: dec("250.50") },
      { id: "d", valor: dec("0.00") },
    ]);
    expect(r.pagaveis.map((p) => p.id)).toEqual(["a", "c"]);
    expect(r.semValor.map((p) => p.id)).toEqual(["b", "d"]);
  });
  it("lote todo zerado não tem nada pagável", () => {
    const r = separarPagaveis([{ id: "a", valor: 0 }]);
    expect(r.pagaveis).toEqual([]);
    expect(r.semValor).toHaveLength(1);
  });
  it("lote vazio devolve as duas listas vazias", () => {
    expect(separarPagaveis([])).toEqual({ pagaveis: [], semValor: [] });
  });
});
