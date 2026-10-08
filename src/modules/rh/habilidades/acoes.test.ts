import { describe, expect, it } from "vitest";
import { itensDaCompetencia, itensDoCatalogo } from "./acoes";
import { MOTIVO_NAO_VALIDA_PROPRIO, MOTIVO_SEM_NIVEL } from "./regras";

const ids = (x: { id: string }[]) => x.map((i) => i.id);

describe("itensDaCompetencia", () => {
  it("gestor valida ou tira a validação", () => {
    expect(ids(itensDaCompetencia({ nivel: 3, validadoEm: null }, { modo: "gestor", ehPropria: false }))).toEqual(["validar"]);
    expect(ids(itensDaCompetencia({ nivel: 3, validadoEm: "x" }, { modo: "gestor", ehPropria: false }))).toEqual(["desvalidar"]);
  });
  it("gestor não valida o próprio nem sem nível", () => {
    expect(itensDaCompetencia({ nivel: 3, validadoEm: null }, { modo: "gestor", ehPropria: true })[0]).toMatchObject({ desabilitado: MOTIVO_NAO_VALIDA_PROPRIO });
    expect(itensDaCompetencia({ nivel: null, validadoEm: null }, { modo: "gestor", ehPropria: false })[0]).toMatchObject({ desabilitado: MOTIVO_SEM_NIVEL });
  });
  it("a pessoa só tira da lista; leitura não tem ação", () => {
    expect(ids(itensDaCompetencia({ nivel: 3, validadoEm: null }, { modo: "self", ehPropria: true }))).toEqual(["remover"]);
    expect(itensDaCompetencia({ nivel: 3, validadoEm: null }, { modo: "leitura", ehPropria: false })).toEqual([]);
  });
});

describe("itensDoCatalogo", () => {
  it("publicada despublica, proposta publica, e excluir avisa o uso", () => {
    expect(ids(itensDoCatalogo({ publicada: true, pessoas: 0, projetos: 0 }))).toEqual(["despublicar", "s1", "excluir"]);
    expect(ids(itensDoCatalogo({ publicada: false, pessoas: 0, projetos: 0 }))[0]).toBe("publicar");
    const excluir = itensDoCatalogo({ publicada: true, pessoas: 2, projetos: 1 }).find((i) => i.id === "excluir");
    expect(excluir?.tipo === "acao" && excluir.confirmar?.descricao).toBe("Ela sai de 2 pessoa(s) e 1 projeto(s).");
  });
});
