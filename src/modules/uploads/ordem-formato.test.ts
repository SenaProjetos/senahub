import { describe, expect, it } from "vitest";
import { ordenarPorFormato } from "./ordem-formato";

const nomes = (lista: string[]) => ordenarPorFormato(lista, (n) => n);

describe("ordenarPorFormato", () => {
  it("põe PDF antes de DWG, qualquer que seja a ordem de entrada", () => {
    expect(nomes(["A-001.dwg", "A-001.pdf"])).toEqual(["A-001.pdf", "A-001.dwg"]);
    expect(nomes(["A-001.pdf", "A-001.dwg"])).toEqual(["A-001.pdf", "A-001.dwg"]);
  });

  it("ignora maiúsculas na extensão", () => {
    expect(nomes(["A-001.DWG", "A-001.Pdf"])).toEqual(["A-001.Pdf", "A-001.DWG"]);
  });

  it("demais extensões vêm depois, em ordem alfabética, e sem extensão vai na frente delas", () => {
    expect(nomes(["m.xlsx", "m.ifc", "m.dwg", "LEIAME", "m.pdf"])).toEqual([
      "m.pdf",
      "m.dwg",
      "LEIAME",
      "m.ifc",
      "m.xlsx",
    ]);
  });

  it("não altera a lista recebida", () => {
    const entrada = ["b.dwg", "b.pdf"];
    nomes(entrada);
    expect(entrada).toEqual(["b.dwg", "b.pdf"]);
  });
});
