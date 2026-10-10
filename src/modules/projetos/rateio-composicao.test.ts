import { describe, expect, it } from "vitest";
import { separarRateioPorVinculo } from "./rateio-composicao";

describe("composição do rateio por vínculo", () => {
  it("separa o custo de CLT e estágio dos demais colaboradores", () => {
    const resultado = separarRateioPorVinculo([
      { custo: 120.45, contratacao: "clt" as const },
      { custo: 79.55, contratacao: "estagio" as const },
      { custo: 35.2, contratacao: "pj" as const },
      { custo: 14.8, contratacao: "autonomo_rpa" as const },
    ]);

    expect(resultado).toEqual({ cltEstagiarios: 200, demaisColaboradores: 50, total: 250 });
  });

  it("mantém o total em centavos sem introduzir erro de ponto flutuante", () => {
    const resultado = separarRateioPorVinculo([
      { custo: 0.1, contratacao: "clt" as const },
      { custo: 0.2, contratacao: "clt" as const },
      { custo: 0.3, contratacao: "pj" as const },
    ]);

    expect(resultado).toEqual({ cltEstagiarios: 0.3, demaisColaboradores: 0.3, total: 0.6 });
  });
});
