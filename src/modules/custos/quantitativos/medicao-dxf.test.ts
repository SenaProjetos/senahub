import { describe, it, expect } from "vitest";
import { comprimentoPorCamada, areaPolilinhasFechadasPorCamada } from "./medicao-dxf";
import type { CenaDwg, Primitiva } from "@/modules/dwg/parse";

describe("comprimentoPorCamada", () => {
  it("soma linha (3-4-5) + polilinha aberta, agrupado por camada", () => {
    const cena: CenaDwg = {
      primitivas: [
        { tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 3, y: 4 }, camada: "EIXO" },
        {
          tipo: "polilinha",
          pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
          fechada: false,
          camada: "EIXO",
        },
        { tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, camada: "PAREDE" },
      ],
      camadas: [],
    };
    expect(comprimentoPorCamada(cena)).toEqual([
      { camada: "EIXO", comprimento: 5 + 20 },
      { camada: "PAREDE", comprimento: 1 },
    ]);
  });

  it("polilinha fechada soma o segmento de fechamento", () => {
    const cena: CenaDwg = {
      primitivas: [
        {
          tipo: "polilinha",
          pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
          fechada: true,
          camada: "CONTORNO",
        },
      ],
      camadas: [],
    };
    expect(comprimentoPorCamada(cena)).toEqual([{ camada: "CONTORNO", comprimento: 40 }]);
  });

  it("círculo (circunferência) e arco (quarto de círculo)", () => {
    const primitivas: Primitiva[] = [
      { tipo: "circulo", centro: { x: 0, y: 0 }, raio: 10, camada: "A" },
      { tipo: "arco", centro: { x: 0, y: 0 }, raio: 10, a0: 0, a1: 90, camada: "B" },
    ];
    const cena: CenaDwg = { primitivas, camadas: [] };
    const resultado = comprimentoPorCamada(cena);
    expect(resultado.find((l) => l.camada === "A")?.comprimento).toBeCloseTo(2 * Math.PI * 10);
    expect(resultado.find((l) => l.camada === "B")?.comprimento).toBeCloseTo((Math.PI / 2) * 10);
  });

  it("filtro de camadas exclui o resto", () => {
    const cena: CenaDwg = {
      primitivas: [
        { tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, camada: "A" },
        { tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 2, y: 0 }, camada: "B" },
      ],
      camadas: [],
    };
    expect(comprimentoPorCamada(cena, ["A"])).toEqual([{ camada: "A", comprimento: 1 }]);
  });

  it("texto não contribui comprimento", () => {
    const cena: CenaDwg = {
      primitivas: [{ tipo: "texto", p: { x: 0, y: 0 }, altura: 2.5, conteudo: "x", rotacao: 0, camada: "TXT" }],
      camadas: [],
    };
    expect(comprimentoPorCamada(cena)).toEqual([{ camada: "TXT", comprimento: 0 }]);
  });
});

describe("areaPolilinhasFechadasPorCamada", () => {
  it("soma área só das polilinhas FECHADAS (retângulo 10x10 = 100)", () => {
    const cena: CenaDwg = {
      primitivas: [
        {
          tipo: "polilinha",
          pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
          fechada: true,
          camada: "PISO",
        },
        {
          tipo: "polilinha",
          pontos: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
          fechada: false,
          camada: "PISO",
        },
      ],
      camadas: [],
    };
    expect(areaPolilinhasFechadasPorCamada(cena)).toEqual([{ camada: "PISO", area: 100 }]);
  });

  it("sem polilinha fechada → vazio", () => {
    const cena: CenaDwg = {
      primitivas: [{ tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, camada: "A" }],
      camadas: [],
    };
    expect(areaPolilinhasFechadasPorCamada(cena)).toEqual([]);
  });
});
