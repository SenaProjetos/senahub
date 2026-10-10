import { describe, it, expect } from "vitest";
import { podeModerarCanal, podeObservarCanal, tiposModeracao, type ModeradorChat } from "./acesso";

const TIPOS = ["geral", "projeto", "disciplina", "dm", "grupo", "socios", "anotacoes"] as const;
const SUPER: ModeradorChat = { superUsuario: true, moderaChat: true };
const MODERADOR: ModeradorChat = { superUsuario: false, moderaChat: true };
const NINGUEM: ModeradorChat = { superUsuario: false, moderaChat: false };

describe("podeObservarCanal", () => {
  it("superusuário observa todos os tipos, inclusive Anotações", () => {
    for (const tipo of TIPOS) expect(podeObservarCanal(SUPER, tipo)).toBe(true);
  });

  it("chat:moderar observa todos, menos Anotações", () => {
    for (const tipo of TIPOS) expect(podeObservarCanal(MODERADOR, tipo)).toBe(tipo !== "anotacoes");
  });

  it("sem a permissão não observa nada", () => {
    for (const tipo of TIPOS) expect(podeObservarCanal(NINGUEM, tipo)).toBe(false);
  });

  it("sem dado falha fechado", () => {
    expect(podeObservarCanal(undefined, "grupo")).toBe(false);
    expect(podeObservarCanal(null, "anotacoes")).toBe(false);
  });
});

describe("podeModerarCanal", () => {
  it("mesma regra de leitura: superusuário tudo, moderador menos Anotações, demais nada", () => {
    for (const tipo of TIPOS) {
      expect(podeModerarCanal(SUPER, tipo)).toBe(true);
      expect(podeModerarCanal(MODERADOR, tipo)).toBe(tipo !== "anotacoes");
      expect(podeModerarCanal(NINGUEM, tipo)).toBe(false);
    }
  });
});

describe("tiposModeracao", () => {
  it("lista o que cada um observa", () => {
    expect(tiposModeracao(SUPER)).toContain("anotacoes");
    expect(tiposModeracao(MODERADOR)).toEqual(["grupo", "dm", "socios"]);
    expect(tiposModeracao(NINGUEM)).toEqual([]);
  });
});
