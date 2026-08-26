import { describe, expect, it } from "vitest";
import { separarRateioPorVinculo } from "./rateio-composicao";

describe("composição do rateio por vínculo", () => {
  it("separa o custo de CLT e estágio dos demais colaboradores", () => {
    const resultado = separarRateioPorVinculo([
      { custo: 120.45, role: "clt" },
      { custo: 79.55, role: "estagiario" },
      { custo: 35.2, role: "projetista_pj" },
      { custo: 14.8, role: "freelancer" },
    ]);

    expect(resultado).toEqual({ cltEstagiarios: 200, demaisColaboradores: 50, total: 250 });
  });

  it("mantém o total em centavos sem introduzir erro de ponto flutuante", () => {
    const resultado = separarRateioPorVinculo([
      { custo: 0.1, role: "clt" },
      { custo: 0.2, role: "clt" },
      { custo: 0.3, role: "projetista_pj" },
    ]);

    expect(resultado).toEqual({ cltEstagiarios: 0.3, demaisColaboradores: 0.3, total: 0.6 });
  });
});
