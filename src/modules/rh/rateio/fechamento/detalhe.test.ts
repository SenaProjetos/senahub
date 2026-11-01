import { describe, expect, it } from "vitest";
import { agruparLinhasDoMes } from "./detalhe";

describe("detalhe do mês do rateio", () => {
  it("soma por projeto, disciplina e natureza, sem separar por pessoa", () => {
    const r = agruparLinhasDoMes([
      { projetoId: "p1", disciplinaId: "d1", natureza: "projeto", minutos: 60, custoCent: 5000 },
      { projetoId: "p1", disciplinaId: "d1", natureza: "projeto", minutos: 30, custoCent: 3000 },
      { projetoId: "p1", disciplinaId: null, natureza: "reuniao", minutos: 20, custoCent: 1500 },
    ]);
    expect(r).toEqual([
      { projetoId: "p1", disciplinaId: "d1", natureza: "projeto", minutos: 90, custoCent: 8000 },
      { projetoId: "p1", disciplinaId: null, natureza: "reuniao", minutos: 20, custoCent: 1500 },
    ]);
  });

  it("ordena por horas e deixa o não alocado por último", () => {
    const r = agruparLinhasDoMes([
      { projetoId: null, disciplinaId: null, natureza: "nao_alocado", minutos: 9999, custoCent: 100 },
      { projetoId: "p2", disciplinaId: null, natureza: "projeto", minutos: 10, custoCent: 1 },
      { projetoId: "p1", disciplinaId: null, natureza: "projeto", minutos: 50, custoCent: 1 },
    ]);
    expect(r.map((g) => g.projetoId)).toEqual(["p1", "p2", null]);
  });
});
