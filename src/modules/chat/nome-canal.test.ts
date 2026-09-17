import { describe, expect, it } from "vitest";

import { nomeCanal } from "./nome-canal";

describe("nomeCanal", () => {
  it("canal de projeto usa o nome atual do projeto, não a cópia gravada", () => {
    expect(
      nomeCanal({ tipo: "projeto", nome: "Nome Antigo", projeto: { nome: "Nome Novo" } }),
    ).toBe("Nome Novo");
  });

  it("canal de disciplina usa o nome atual da disciplina", () => {
    expect(
      nomeCanal({
        tipo: "disciplina",
        nome: "Elétrico",
        disciplina: { disciplinaTextoLegado: "Elétrica" },
      }),
    ).toBe("Elétrica");
  });

  it("grupo mantém o nome próprio", () => {
    expect(nomeCanal({ tipo: "grupo", nome: "Coordenação" })).toBe("Coordenação");
  });

  it("projeto sem a relação carregada cai no fallback da coluna", () => {
    expect(nomeCanal({ tipo: "projeto", nome: "Copiado", projeto: null })).toBe("Copiado");
  });

  it("sem nome nenhum, cai no tipo", () => {
    expect(nomeCanal({ tipo: "socios", nome: null })).toBe("socios");
  });
});
