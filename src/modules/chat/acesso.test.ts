import { describe, it, expect } from "vitest";
import { podeModerarCanal, podeObservarCanal, tiposModeracao } from "./acesso";

const TIPOS = ["geral", "projeto", "disciplina", "dm", "grupo", "socios", "anotacoes"] as const;
const DEMAIS_ROLES = ["administrativo", "clt", "estagiario", "projetista_pj", "freelancer", "cliente", "ti"];

describe("podeObservarCanal", () => {
  it("admin observa todos os tipos, inclusive Anotações", () => {
    for (const tipo of TIPOS) expect(podeObservarCanal("admin", tipo)).toBe(true);
  });

  it("supervisor observa todos os tipos, exceto Anotações", () => {
    for (const tipo of TIPOS) {
      expect(podeObservarCanal("supervisor", tipo)).toBe(tipo !== "anotacoes");
    }
  });

  it("nenhum outro perfil observa canal de que não participa", () => {
    for (const role of DEMAIS_ROLES) {
      for (const tipo of TIPOS) expect(podeObservarCanal(role, tipo)).toBe(false);
    }
  });

  it("sem perfil não observa nada", () => {
    expect(podeObservarCanal(undefined, "grupo")).toBe(false);
    expect(podeObservarCanal(null, "anotacoes")).toBe(false);
  });
});

describe("podeModerarCanal", () => {
  it("admin modera tudo; supervisor tudo menos Anotações; demais nada", () => {
    for (const tipo of TIPOS) {
      expect(podeModerarCanal("admin", tipo)).toBe(true);
      expect(podeModerarCanal("supervisor", tipo)).toBe(tipo !== "anotacoes");
      for (const role of DEMAIS_ROLES) expect(podeModerarCanal(role, tipo)).toBe(false);
    }
  });
});

describe("tiposModeracao", () => {
  it("admin lista Anotações na moderação; supervisor não", () => {
    expect(tiposModeracao("admin")).toContain("anotacoes");
    expect(tiposModeracao("supervisor")).toEqual(["grupo", "dm", "socios"]);
  });

  it("perfil sem moderação recebe lista vazia", () => {
    expect(tiposModeracao("clt")).toEqual([]);
  });
});
