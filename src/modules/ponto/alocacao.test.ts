import { describe, expect, it } from "vitest";
import {
  ALOCACAO_REUNIAO_EXTERNA,
  ALOCACAO_REUNIAO_INTERNA,
  ALOCACAO_SEM_PROJETO,
  normalizarAlocacaoPonto,
  selecaoDaAlocacaoPonto,
} from "./alocacao";

describe("alocação de ponto", () => {
  it("separa as reuniões das horas sem projeto", () => {
    expect(normalizarAlocacaoPonto(ALOCACAO_REUNIAO_INTERNA)).toEqual({
      projetoId: null,
      tipoAlocacao: "reuniao_interna",
    });
    expect(normalizarAlocacaoPonto(ALOCACAO_REUNIAO_EXTERNA)).toEqual({
      projetoId: null,
      tipoAlocacao: "reuniao_externa",
    });
  });

  it("preserva uma seleção de projeto e converte o sem projeto", () => {
    expect(normalizarAlocacaoPonto("projeto-42")).toEqual({
      projetoId: "projeto-42",
      tipoAlocacao: "projeto",
    });
    expect(normalizarAlocacaoPonto()).toEqual({ projetoId: null, tipoAlocacao: "sem_projeto" });
    expect(selecaoDaAlocacaoPonto(null, "sem_projeto")).toBe(ALOCACAO_SEM_PROJETO);
  });
});
