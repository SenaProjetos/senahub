import { describe, expect, it } from "vitest";
import { climaVisivel, horasAcimaDaEscala, maiorSequencia, superalocacaoRecorrente } from "./sinais";

const S = ["W40", "W41", "W42", "W43", "W44"];

describe("maiorSequencia", () => {
  it("acha a maior sequência e as pontas", () => {
    const acima = new Set(["W40", "W42", "W43", "W44"]);
    expect(maiorSequencia(S, (s) => acima.has(s))).toEqual({ tamanho: 3, de: "W42", ate: "W44" });
  });
});

describe("superalocacaoRecorrente", () => {
  const cap = Object.fromEntries(S.map((s) => [s, 40]));
  it("3 semanas seguidas acima entra; 2 seguidas não", () => {
    const r = superalocacaoRecorrente(
      [
        { userId: "a", nome: "Ana", carga: { W41: 45, W42: 50, W43: 41 }, capacidade: cap },
        { userId: "b", nome: "Bia", carga: { W40: 45, W41: 45, W43: 45 }, capacidade: cap },
      ],
      S,
    );
    expect(r).toEqual([{ userId: "a", nome: "Ana", semanas: 3, de: "W41", ate: "W43" }]);
  });
  it("semana de férias (capacidade 0) sem carga não conta como excesso", () => {
    expect(superalocacaoRecorrente([{ userId: "a", nome: "Ana", carga: {}, capacidade: { W40: 0, W41: 0, W42: 0 } }], S)).toEqual([]);
  });
});

describe("horasAcimaDaEscala", () => {
  it("conta semanas com horas reais acima da capacidade + 10%", () => {
    const r = horasAcimaDaEscala(
      [
        { userId: "a", nome: "Ana", porSemana: { W40: 50, W41: 45, W42: 43 }, capacidadePorSemana: { W40: 40, W41: 40, W42: 40 } },
        { userId: "b", nome: "Bia", porSemana: { W40: 50 }, capacidadePorSemana: { W40: 0 } },
      ],
      ["W40", "W41", "W42"],
    );
    expect(r).toEqual([{ userId: "a", nome: "Ana", semanas: 2, excessoHoras: 15 }]);
  });
});

describe("clima", () => {
  it("abaixo de 3 respostas não mostra", () => {
    expect([climaVisivel(2), climaVisivel(3)]).toEqual([false, true]);
  });
});
