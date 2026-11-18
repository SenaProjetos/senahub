import { describe, expect, it } from "vitest";
import { atalhoNoAlvo, cliqueRepetido } from "./atalhos";

describe("cliqueRepetido", () => {
  it("o segundo clique de um duplo clique (rápido e no mesmo lugar) não vale como outro ponto", () => {
    expect(cliqueRepetido({ x: 10, y: 10, t: 1000 }, { x: 11, y: 10, t: 1200 })).toBe(true);
  });
  it("clique em outro lugar, ou depois de uma pausa, vale", () => {
    expect(cliqueRepetido({ x: 10, y: 10, t: 1000 }, { x: 40, y: 10, t: 1100 })).toBe(false);
    expect(cliqueRepetido({ x: 10, y: 10, t: 1000 }, { x: 10, y: 10, t: 1600 })).toBe(false);
    expect(cliqueRepetido(null, { x: 10, y: 10, t: 1000 })).toBe(false);
  });
});

describe("atalhoNoAlvo", () => {
  it("vale com o foco na página (depois de clicar no desenho) ou no próprio desenho", () => {
    expect(atalhoNoAlvo({ tagName: "BODY" })).toBe(true);
    expect(atalhoNoAlvo({ tagName: "CANVAS" })).toBe(true);
  });
  it("não rouba a tecla de botão, aba, campo, seletor ou divisória em foco", () => {
    for (const tagName of ["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A", "DIV"]) {
      expect(atalhoNoAlvo({ tagName })).toBe(false);
    }
  });
  it("sem alvo (evento sintético) não vale", () => {
    expect(atalhoNoAlvo(null)).toBe(false);
  });
});
