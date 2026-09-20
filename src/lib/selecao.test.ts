import { describe, expect, it } from "vitest";

import {
  alternar,
  alternarPagina,
  estadoDaPagina,
  foraDaPagina,
  selecaoAoAbrirMenu,
  selecionarSomente,
} from "./selecao";

const conjunto = (...ids: string[]) => new Set(ids);
const lista = (s: ReadonlySet<string>) => [...s].sort();

describe("alternar", () => {
  it("marca o que não estava e desmarca o que estava", () => {
    expect(lista(alternar(conjunto(), "a"))).toEqual(["a"]);
    expect(lista(alternar(conjunto("a", "b"), "a"))).toEqual(["b"]);
  });

  it("não altera o conjunto recebido", () => {
    const original = conjunto("a");
    alternar(original, "b");
    expect(lista(original)).toEqual(["a"]);
  });
});

describe("alternarPagina", () => {
  it("marca a página inteira quando falta alguém", () => {
    expect(lista(alternarPagina(conjunto("a"), ["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });

  it("desmarca a página inteira quando já está toda marcada", () => {
    expect(lista(alternarPagina(conjunto("a", "b"), ["a", "b"]))).toEqual([]);
  });

  // O ponto da decisão do dono: seleção feita em outro filtro não pode sumir.
  it("preserva o que foi marcado fora da página", () => {
    expect(lista(alternarPagina(conjunto("z"), ["a", "b"]))).toEqual(["a", "b", "z"]);
    expect(lista(alternarPagina(conjunto("z", "a", "b"), ["a", "b"]))).toEqual(["z"]);
  });
});

describe("selecaoAoAbrirMenu", () => {
  it("linha DENTRO da seleção mantém o conjunto (a ação vale para todos)", () => {
    expect(lista(selecaoAoAbrirMenu(conjunto("a", "b"), "a"))).toEqual(["a", "b"]);
  });

  it("linha FORA da seleção passa a ser a seleção inteira", () => {
    expect(lista(selecaoAoAbrirMenu(conjunto("a", "b"), "c"))).toEqual(["c"]);
  });

  it("sem seleção nenhuma, vale a linha clicada", () => {
    expect(lista(selecaoAoAbrirMenu(conjunto(), "c"))).toEqual(["c"]);
  });
});

describe("selecionarSomente", () => {
  it("devolve só a linha pedida", () => {
    expect(lista(selecionarSomente("x"))).toEqual(["x"]);
  });
});

describe("estadoDaPagina", () => {
  it("distingue nenhum, alguns e todos", () => {
    expect(estadoDaPagina(conjunto(), ["a", "b"])).toBe("nenhum");
    expect(estadoDaPagina(conjunto("a"), ["a", "b"])).toBe("alguns");
    expect(estadoDaPagina(conjunto("a", "b"), ["a", "b"])).toBe("todos");
  });

  it("página vazia é 'nenhum', nunca 'todos'", () => {
    expect(estadoDaPagina(conjunto("a"), [])).toBe("nenhum");
  });

  it("marcado de outra página não conta como 'todos' aqui", () => {
    expect(estadoDaPagina(conjunto("z"), ["a"])).toBe("nenhum");
  });
});

describe("foraDaPagina", () => {
  it("conta o que está selecionado e não aparece na página", () => {
    expect(foraDaPagina(conjunto("a", "z"), ["a", "b"])).toBe(1);
    expect(foraDaPagina(conjunto("a"), ["a", "b"])).toBe(0);
    expect(foraDaPagina(conjunto(), ["a"])).toBe(0);
  });
});
