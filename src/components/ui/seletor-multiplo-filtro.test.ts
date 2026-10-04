import { describe, expect, it } from "vitest";
import { alternarId, filtrarOpcoes } from "./seletor-multiplo-filtro";

const PESSOAS = [
  { id: "1", rotulo: "Ana Paula Da Silva" },
  { id: "2", rotulo: "ANA CLAUDIA" },
  { id: "3", rotulo: "Diêgo Barbosa de Carvalho", detalhe: "Projetista" },
  { id: "4", rotulo: "Lúcio Sena" },
];

describe("filtrarOpcoes", () => {
  it("busca vazia devolve tudo, na ordem", () => {
    expect(filtrarOpcoes(PESSOAS, "  ").map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("ignora acento e caixa", () => {
    expect(filtrarOpcoes(PESSOAS, "diego").map((p) => p.id)).toEqual(["3"]);
    expect(filtrarOpcoes(PESSOAS, "LUCIO").map((p) => p.id)).toEqual(["4"]);
  });

  it("casa por palavra, em qualquer ordem", () => {
    expect(filtrarOpcoes(PESSOAS, "silva ana").map((p) => p.id)).toEqual(["1"]);
    expect(filtrarOpcoes(PESSOAS, "ana").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("o detalhe também entra na busca", () => {
    expect(filtrarOpcoes(PESSOAS, "projetista").map((p) => p.id)).toEqual(["3"]);
  });
});

describe("alternarId", () => {
  it("liga no fim e desliga sem mexer na ordem dos outros", () => {
    expect(alternarId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(alternarId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
