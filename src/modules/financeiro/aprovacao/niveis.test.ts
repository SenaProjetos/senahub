import { describe, it, expect } from "vitest";
import { faixaPara, precisaAprovacao, papeisAprovadores, type FaixaAlcada } from "./niveis";

const faixas: FaixaAlcada[] = [
  { ate: 5000, papeis: [] },
  { ate: 20000, papeis: ["administrativo"] },
  { ate: null, papeis: ["supervisor", "admin"] },
];

describe("faixaPara", () => {
  it("escolhe a faixa de menor teto que cobre o valor", () => {
    expect(faixaPara(3000, faixas)?.ate).toBe(5000);
    expect(faixaPara(10000, faixas)?.ate).toBe(20000);
    expect(faixaPara(50000, faixas)?.ate).toBeNull();
  });
  it("valor igual ao teto cai na própria faixa", () => {
    expect(faixaPara(5000, faixas)?.ate).toBe(5000);
  });
});

describe("precisaAprovacao", () => {
  it("receita nunca precisa", () => {
    expect(precisaAprovacao("receita", 99999, faixas)).toBe(false);
  });
  it("despesa abaixo do 1º teto é automática", () => {
    expect(precisaAprovacao("despesa", 3000, faixas)).toBe(false);
  });
  it("despesa em faixa com papéis precisa", () => {
    expect(precisaAprovacao("despesa", 10000, faixas)).toBe(true);
    expect(precisaAprovacao("despesa", 50000, faixas)).toBe(true);
  });
});

describe("papeisAprovadores", () => {
  it("retorna os papéis da faixa", () => {
    expect(papeisAprovadores(10000, faixas)).toEqual(["administrativo"]);
    expect(papeisAprovadores(50000, faixas)).toEqual(["supervisor", "admin"]);
    expect(papeisAprovadores(3000, faixas)).toEqual([]);
  });
});
