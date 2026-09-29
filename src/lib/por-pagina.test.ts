import { describe, expect, it } from "vitest";
import { chavePorPagina, porPaginaPreferido } from "./por-pagina";

describe("porPaginaPreferido", () => {
  it("devolve o que a pessoa escolheu para aquela lista", () => {
    expect(porPaginaPreferido({ [chavePorPagina("projetos")]: 48 }, "projetos")).toBe(48);
  });

  it("uma lista não mexe na outra", () => {
    const prefs = { [chavePorPagina("projetos")]: 48 };
    expect(porPaginaPreferido(prefs, "tarefas", 24)).toBe(24);
  });

  it("sem preferência, o padrão da lista (que pode ser 24 e não 12)", () => {
    expect(porPaginaPreferido({}, "projetos")).toBe(12);
    expect(porPaginaPreferido({}, "notificacoes", 24)).toBe(24);
  });

  it("valor que não é um tamanho oferecido cai no padrão", () => {
    for (const lixo of [7, 1000, "48", null, undefined, {}, -1]) {
      expect(porPaginaPreferido({ [chavePorPagina("projetos")]: lixo }, "projetos", 12)).toBe(12);
    }
  });
});
