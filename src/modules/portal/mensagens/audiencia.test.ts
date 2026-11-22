import { describe, expect, it } from "vitest";
import { destinatariosDaEquipe, ehPapelDeCoordenacao, podeVerConversa, type FatosAudiencia } from "./audiencia";

const base: FatosAudiencia = {
  ativo: true,
  tipo: "interno",
  superUsuario: false,
  escopoGlobalPerfil: false,
  papelNoProjeto: null,
  perfilChave: null,
  enxergaProjeto: false,
};

describe("podeVerConversa", () => {
  it("projetista membro do projeto não vê", () => {
    expect(podeVerConversa({ ...base, papelNoProjeto: "projetista", enxergaProjeto: true })).toBe(false);
  });
  it("coordenador do projeto vê", () => {
    expect(podeVerConversa({ ...base, papelNoProjeto: "coordenador", enxergaProjeto: true })).toBe(true);
  });
  it("perfil coordenador sem enxergar o projeto não vê", () => {
    expect(podeVerConversa({ ...base, perfilChave: "coordenador", enxergaProjeto: false })).toBe(false);
  });
  it("perfil coordenador que enxerga vê", () => {
    expect(podeVerConversa({ ...base, perfilChave: "coordenador", enxergaProjeto: true })).toBe(true);
  });
  it("escopo global vê sem ser membro", () => {
    expect(podeVerConversa({ ...base, escopoGlobalPerfil: true })).toBe(true);
    expect(podeVerConversa({ ...base, superUsuario: true })).toBe(true);
  });
  it("externo nunca vê, nem superUsuario", () => {
    expect(podeVerConversa({ ...base, tipo: "externo", superUsuario: true, escopoGlobalPerfil: true, papelNoProjeto: "coordenador" })).toBe(false);
  });
  it("inativo não vê", () => {
    expect(podeVerConversa({ ...base, ativo: false, superUsuario: true })).toBe(false);
  });
});

describe("ehPapelDeCoordenacao", () => {
  it("só o papel coordenador", () => {
    expect(ehPapelDeCoordenacao("coordenador")).toBe(true);
    expect(ehPapelDeCoordenacao("projetista")).toBe(false);
    expect(ehPapelDeCoordenacao(null)).toBe(false);
  });
});

describe("destinatariosDaEquipe", () => {
  it("avisa os coordenadores, sem o autor e sem repetir", () => {
    expect(destinatariosDaEquipe({ coordenadores: ["a", "b", "a"], globais: ["g"], autorId: "b" })).toEqual(["a"]);
  });
  it("sem coordenadores avisa os globais, nunca o autor", () => {
    expect(destinatariosDaEquipe({ coordenadores: [], globais: ["g1", "g2"], autorId: "g1" })).toEqual(["g2"]);
  });
});
