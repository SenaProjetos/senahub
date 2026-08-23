import { describe, expect, it } from "vitest";
import { LIMITE_FILTROS_SALVOS, normalizarParams, parseFiltrosSalvos } from "./filtros-salvos";

describe("filtros salvos da Inteligência", () => {
  it("ignora JSON corrompido e chaves de URL desconhecidas", () => {
    expect(parseFiltrosSalvos(null)).toEqual([]);
    expect(
      parseFiltrosSalvos([
        { id: "1", nome: "Clientes inativos", params: { foco: "clientes_inativos", admin: "1" } },
        { id: null, nome: "inválido", params: {} },
      ]),
    ).toEqual([
      { id: "1", nome: "Clientes inativos", params: { foco: "clientes_inativos" } },
    ]);
  });

  it("limita a quantidade para impedir crescimento sem fim no JSON do usuário", () => {
    const itens = Array.from({ length: LIMITE_FILTROS_SALVOS + 5 }, (_, i) => ({
      id: `f${i}`,
      nome: `Filtro ${i}`,
      params: {},
    }));
    expect(parseFiltrosSalvos(itens)).toHaveLength(LIMITE_FILTROS_SALVOS);
  });

  it("normaliza os parâmetros que podem voltar para a URL", () => {
    expect(normalizarParams({ periodo: "90d", foco: "prospects_esquecidos", perigoso: "x" })).toEqual({
      periodo: "90d",
      foco: "prospects_esquecidos",
    });
  });
});
