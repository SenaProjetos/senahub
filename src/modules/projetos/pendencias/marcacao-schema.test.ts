import { describe, expect, it } from "vitest";
import { colunasDaMarcacao, marcacaoSchema } from "./marcacao-schema";

describe("colunasDaMarcacao", () => {
  it("pino não grava geometria", () => {
    expect(colunasDaMarcacao(null)).toEqual({ marcacaoTipo: null, marcacaoGeo: undefined });
    expect(colunasDaMarcacao({ tipo: "ponto", pontos: [] })).toEqual({ marcacaoTipo: null, marcacaoGeo: undefined });
  });
  it("rabisco grava traços e estilos, sem pontos", () => {
    const tracos = [[{ dx: 0, dy: 0 }, { dx: 0.1, dy: 0.1 }]];
    const estilos = [{ cor: "azul" as const, espessura: 2 }];
    expect(colunasDaMarcacao({ tipo: "livre", pontos: [], tracos, estilos })).toEqual({
      marcacaoTipo: "livre",
      marcacaoGeo: { pontos: [], tracos, estilos },
    });
  });
  it("medida com várias medidas grava as medidas", () => {
    const medidas = [{ de: { dx: 0, dy: 0 }, ate: { dx: 0.2, dy: 0 }, mm: 1000 }];
    expect(colunasDaMarcacao({ tipo: "medida", pontos: [{ dx: 0.2, dy: 0 }], medidas }).marcacaoGeo).toEqual({
      pontos: [{ dx: 0.2, dy: 0 }],
      medidas,
    });
  });
  it("retângulo grava só os pontos", () => {
    expect(colunasDaMarcacao({ tipo: "retangulo", pontos: [{ dx: 0.1, dy: 0.2 }] })).toEqual({
      marcacaoTipo: "retangulo",
      marcacaoGeo: { pontos: [{ dx: 0.1, dy: 0.2 }] },
    });
  });
});

describe("marcacaoSchema", () => {
  it("rabisco sem traços é inválido", () => {
    expect(marcacaoSchema.safeParse({ tipo: "livre", pontos: [] }).success).toBe(false);
  });
});
