import { describe, it, expect } from "vitest";
import {
  REGEX_MENCAO_CURSOR,
  extrairMencoes,
  partesComMencao,
  inserirMencaoNoTexto,
  mencionouTodos,
} from "./mencoes";

describe("REGEX_MENCAO_CURSOR", () => {
  it("casa @nome ASCII no final", () => {
    expect(REGEX_MENCAO_CURSOR.test("oi @Joao")).toBe(true);
  });

  it("casa @nome com acento no final", () => {
    expect(REGEX_MENCAO_CURSOR.test("oi @José")).toBe(true);
  });

  it("casa @nome com til no final", () => {
    expect(REGEX_MENCAO_CURSOR.test("fala @Conceição")).toBe(true);
  });

  it("casa digitação parcial (@Jo)", () => {
    expect(REGEX_MENCAO_CURSOR.test("olá @Jo")).toBe(true);
  });

  it("não casa @nome no meio do texto", () => {
    expect(REGEX_MENCAO_CURSOR.test("@João aqui")).toBe(false);
  });

  it("não casa email (texto@dominio)", () => {
    expect(REGEX_MENCAO_CURSOR.test("enviar para joao@empresa.com")).toBe(false);
  });
});

describe("extrairMencoes", () => {
  it("extrai menção única", () => {
    expect(extrairMencoes("oi @João")).toEqual(["@João"]);
  });

  it("extrai múltiplas menções", () => {
    expect(extrairMencoes("@Maria e @João e @Conceição")).toEqual([
      "@Maria",
      "@João",
      "@Conceição",
    ]);
  });

  it("deduplica menções repetidas", () => {
    expect(extrairMencoes("@João e @João")).toEqual(["@João"]);
  });

  it("retorna vazio sem menções", () => {
    expect(extrairMencoes("olá mundo")).toEqual([]);
  });

  it("não extrai email como menção", () => {
    expect(extrairMencoes("fala joao@empresa.com")).toEqual([]);
  });
});

describe("partesComMencao", () => {
  it("divide em partes", () => {
    const partes = partesComMencao("oi @João tudo bem");
    expect(partes.some((p) => p === "@João")).toBe(true);
    expect(partes.some((p) => p.includes("oi"))).toBe(true);
  });

  it("texto sem menção retorna uma parte", () => {
    expect(partesComMencao("texto simples")).toEqual(["texto simples"]);
  });
});

describe("mencionouTodos", () => {
  it("detecta @todos", () => {
    expect(mencionouTodos("atenção @todos reunião agora")).toBe(true);
  });

  it("detecta @all", () => {
    expect(mencionouTodos("heads up @all")).toBe(true);
  });

  it("é case-insensitive (@Todos, @ALL)", () => {
    expect(mencionouTodos("oi @Todos")).toBe(true);
    expect(mencionouTodos("oi @ALL")).toBe(true);
  });

  it("não dispara para menção normal", () => {
    expect(mencionouTodos("oi @João")).toBe(false);
  });

  it("não dispara sem menção", () => {
    expect(mencionouTodos("todos vieram")).toBe(false);
  });
});

describe("inserirMencaoNoTexto", () => {
  it("substitui menção parcial pelo nome completo", () => {
    expect(inserirMencaoNoTexto("olá @Jo", "João Silva")).toBe("olá @João ");
  });

  it("usa apenas o primeiro token do nome", () => {
    expect(inserirMencaoNoTexto("@Mar", "Maria Clara")).toBe("@Maria ");
  });

  it("preserva prefixo com espaço", () => {
    expect(inserirMencaoNoTexto("hey @Con", "Conceição")).toBe("hey @Conceição ");
  });
});
