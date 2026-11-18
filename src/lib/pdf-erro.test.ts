import { describe, expect, it } from "vitest";
import { ehCancelamentoDoPdf } from "./pdf-erro";

function erroComNome(nome: string, mensagem = "x") {
  const e = new Error(mensagem);
  e.name = nome;
  return e;
}

describe("ehCancelamentoDoPdf", () => {
  it("reconhece o cancelamento do desenho e o da camada de texto", () => {
    expect(ehCancelamentoDoPdf(erroComNome("RenderingCancelledException", "Rendering cancelled, page 1"))).toBe(true);
    expect(ehCancelamentoDoPdf(erroComNome("AbortException", "TextLayer task cancelled."))).toBe(true);
  });

  it("falha de verdade não é cancelamento", () => {
    expect(ehCancelamentoDoPdf(new Error("Invalid PDF structure"))).toBe(false);
    expect(ehCancelamentoDoPdf(erroComNome("InvalidPDFException"))).toBe(false);
    expect(ehCancelamentoDoPdf(erroComNome("UnknownErrorException"))).toBe(false);
  });

  it("valores que não são erro caem em false, sem lançar", () => {
    for (const v of [undefined, null, "RenderingCancelledException", 42, {}, { name: 1 }]) {
      expect(ehCancelamentoDoPdf(v)).toBe(false);
    }
  });

  it("aceita objeto simples com o nome (a exceção do pdf.js atravessa o worker como objeto)", () => {
    expect(ehCancelamentoDoPdf({ name: "RenderingCancelledException" })).toBe(true);
  });
});
