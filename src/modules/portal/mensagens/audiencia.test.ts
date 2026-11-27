import { describe, expect, it } from "vitest";
import { coordenaOProjeto, destinatariosDaEquipe, podeVerConversa, type FatosAudiencia } from "./audiencia";

const base: FatosAudiencia = {
  ativo: true,
  tipo: "interno",
  superUsuario: false,
  escopoGlobalPerfil: false,
  perfilChave: null,
  enxergaProjeto: false,
};

describe("podeVerConversa", () => {
  it("membro do projeto sem perfil Coordenador não vê", () => {
    expect(podeVerConversa({ ...base, perfilChave: "projetista_pj", enxergaProjeto: true })).toBe(false);
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
    expect(podeVerConversa({ ...base, tipo: "externo", superUsuario: true, escopoGlobalPerfil: true, perfilChave: "coordenador", enxergaProjeto: true })).toBe(false);
  });
  it("inativo não vê", () => {
    expect(podeVerConversa({ ...base, ativo: false, superUsuario: true })).toBe(false);
  });
});

describe("coordenaOProjeto", () => {
  it("perfil Coordenador que enxerga o projeto coordena", () => {
    expect(coordenaOProjeto({ ...base, perfilChave: "coordenador", enxergaProjeto: true })).toBe(true);
  });
  it("sem enxergar, outro perfil, externo ou inativo não coordena", () => {
    expect(coordenaOProjeto({ ...base, perfilChave: "coordenador", enxergaProjeto: false })).toBe(false);
    expect(coordenaOProjeto({ ...base, perfilChave: "clt", enxergaProjeto: true })).toBe(false);
    expect(coordenaOProjeto({ ...base, tipo: "externo", perfilChave: "coordenador", enxergaProjeto: true })).toBe(false);
    expect(coordenaOProjeto({ ...base, ativo: false, perfilChave: "coordenador", enxergaProjeto: true })).toBe(false);
  });
  it("escopo global sem perfil Coordenador vê a conversa mas não coordena", () => {
    const f = { ...base, escopoGlobalPerfil: true, perfilChave: "administrativo", enxergaProjeto: true };
    expect(podeVerConversa(f)).toBe(true);
    expect(coordenaOProjeto(f)).toBe(false);
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
