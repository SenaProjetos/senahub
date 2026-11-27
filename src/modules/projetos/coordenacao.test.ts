import { describe, expect, it } from "vitest";
import { coordenaProjeto, ehPerfilCoordenador } from "./coordenacao";

const base = { perfilChave: "coordenador", participa: false, superUsuario: false, escopoGlobalPerfil: false, tipo: "interno" as const };

describe("coordenaProjeto", () => {
  it("perfil Coordenador que participa do projeto coordena", () => {
    expect(coordenaProjeto({ ...base, participa: true })).toBe(true);
  });
  it("perfil Coordenador com escopo global coordena sem participar", () => {
    expect(coordenaProjeto({ ...base, escopoGlobalPerfil: true })).toBe(true);
    expect(coordenaProjeto({ ...base, superUsuario: true })).toBe(true);
  });
  it("perfil Coordenador que não enxerga o projeto não coordena", () => {
    expect(coordenaProjeto(base)).toBe(false);
  });
  it("outro perfil não coordena, nem com escopo global ou na equipe", () => {
    expect(coordenaProjeto({ ...base, perfilChave: "clt", participa: true, escopoGlobalPerfil: true })).toBe(false);
    expect(coordenaProjeto({ ...base, perfilChave: null, superUsuario: true })).toBe(false);
  });
  it("externo nunca coordena", () => {
    expect(coordenaProjeto({ ...base, tipo: "externo", participa: true, superUsuario: true })).toBe(false);
  });
});

describe("ehPerfilCoordenador", () => {
  it("só a chave exata do perfil", () => {
    expect(ehPerfilCoordenador("coordenador")).toBe(true);
    expect(ehPerfilCoordenador("Coordenador")).toBe(false);
    expect(ehPerfilCoordenador(null)).toBe(false);
  });
});
