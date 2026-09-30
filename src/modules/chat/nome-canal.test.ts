import { describe, expect, it } from "vitest";

import { nomeCanal, origemMensagem } from "./nome-canal";

describe("origemMensagem", () => {
  it("DM diz que é privada, sem nome", () => {
    expect(origemMensagem("dm", null)).toBe("Mensagem privada");
  });

  it("grupo mostra o nome do grupo", () => {
    expect(origemMensagem("grupo", "Coordenação")).toBe("Grupo Coordenação");
  });

  it("projeto e disciplina dizem o tipo antes do nome", () => {
    expect(origemMensagem("projeto", "Residencial Alfa")).toBe("Projeto Residencial Alfa");
    expect(origemMensagem("disciplina", "Elétrica")).toBe("Disciplina Elétrica");
  });

  it("geral e sócios são canais", () => {
    expect(origemMensagem("geral", "Geral")).toBe("Canal Geral");
    expect(origemMensagem("socios", "Sócios")).toBe("Canal Sócios");
  });

  it("anotações não repete o nome", () => {
    expect(origemMensagem("anotacoes", "Minhas anotações")).toBe("Anotações");
  });
});

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
