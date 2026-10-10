import { describe, expect, it } from "vitest";
import {
  avisosDeOrigem,
  formatarDistancia,
  modelosDistantes,
  vaoEntreCaixas,
  type CaixaDoModelo,
} from "@/modules/coordenacao/origem";

const caixa = (modeloId: string, min: [number, number, number], max: [number, number, number]): CaixaDoModelo => ({
  modeloId,
  min,
  max,
});

const arq = caixa("ARQ", [0, 0, 0], [60, 10, 40]);
const est = caixa("EST", [1, 0, 1], [59, 9, 39]);

describe("vaoEntreCaixas", () => {
  it("zero quando se cruzam ou encostam", () => {
    expect(vaoEntreCaixas(arq, est)).toBe(0);
    expect(vaoEntreCaixas(caixa("a", [0, 0, 0], [1, 1, 1]), caixa("b", [1, 0, 0], [2, 1, 1]))).toBe(0);
  });
  it("distância entre os cantos mais próximos", () => {
    expect(vaoEntreCaixas(caixa("a", [0, 0, 0], [1, 1, 1]), caixa("b", [4, 5, 1], [5, 6, 2]))).toBeCloseTo(5, 9);
  });
});

describe("modelosDistantes", () => {
  it("modelos sobrepostos não geram aviso", () => {
    expect(modelosDistantes([arq, est])).toEqual([]);
  });

  it("acusa o modelo a 1,2 km dos outros", () => {
    const longe = caixa("SESI", [1260, 0, 0], [1300, 10, 30]);
    const r = modelosDistantes([arq, est, longe]);
    expect(r.map((m) => [m.modeloId, Math.round(m.distancia), m.maisProximoId])).toEqual([["SESI", 1200, "ARQ"]]);
  });

  it("anexo a 80 m mas maior que o vão (terreno) não é acusado", () => {
    const terreno = caixa("TERRENO", [140, -100, -1], [400, 100, 0]);
    expect(modelosDistantes([arq, est, terreno])).toEqual([]);
  });

  it("com dois modelos afastados, os dois aparecem", () => {
    const longe = caixa("SESI", [5000, 0, 0], [5020, 10, 10]);
    expect(modelosDistantes([arq, longe]).map((m) => m.modeloId).sort()).toEqual(["ARQ", "SESI"]);
  });

  it("um modelo só, ou caixa vazia (infinita), não gera aviso", () => {
    expect(modelosDistantes([arq])).toEqual([]);
    expect(modelosDistantes([arq, caixa("VAZIO", [Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity])])).toEqual([]);
  });
});

describe("formatarDistancia", () => {
  it("metros abaixo de 1 km, km acima", () => {
    expect(formatarDistancia(850.4)).toBe("850 m");
    expect(formatarDistancia(1234)).toBe("1,2 km");
    expect(formatarDistancia(12_345)).toBe("12 km");
  });
});

describe("avisosDeOrigem", () => {
  it("dois modelos longe um do outro viram UM aviso com os dois", () => {
    const longe = caixa("SESI", [5000, 0, 0], [5020, 10, 10]);
    const avisos = avisosDeOrigem(modelosDistantes([arq, longe]));
    expect(avisos).toHaveLength(1);
    expect(avisos[0].modeloIds.sort()).toEqual(["ARQ", "SESI"]);
    expect(avisos[0].maisProximoId).toBeNull();
  });

  it("um modelo longe de um grupo continua com aviso próprio e o vizinho", () => {
    const longe = caixa("SESI", [1260, 0, 0], [1300, 10, 30]);
    const avisos = avisosDeOrigem(modelosDistantes([arq, est, longe]));
    expect(avisos).toEqual([{ modeloIds: ["SESI"], maisProximoId: "ARQ", distancia: expect.any(Number) }]);
  });
});
