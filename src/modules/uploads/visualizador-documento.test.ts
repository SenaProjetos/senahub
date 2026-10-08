import { describe, expect, it } from "vitest";

import { visualizadorDoDocumento } from "./visualizador-documento";

const pdf = { id: "p1", nome: "A-01.pdf", ext: "pdf" };
const dwg = { id: "d1", nome: "A-01.dwg", ext: "dwg" };
const ifc = { id: "i1", nome: "modelo.ifc", ext: "ifc" };
const rvt = { id: "r1", nome: "modelo.rvt", ext: "rvt" };

describe("visualizadorDoDocumento", () => {
  it("com PDF e DWG na mesma revisão, abre o PDF", () => {
    expect(visualizadorDoDocumento([dwg, pdf], true)).toEqual({ tipo: "pdf", uploadId: "p1" });
  });

  it("na pasta de formato DWG (só o DWG na linha), abre o DWG", () => {
    expect(visualizadorDoDocumento([dwg], true)).toEqual({ tipo: "dwg", uploadId: "d1", nome: "A-01.dwg" });
  });

  it("IFC só abre a Compatibilização para quem pode vê-la", () => {
    expect(visualizadorDoDocumento([ifc], true)).toEqual({ tipo: "ifc" });
    expect(visualizadorDoDocumento([ifc], false)).toBeNull();
  });

  it("sem formato com visualizador, o título não abre nada", () => {
    expect(visualizadorDoDocumento([rvt], true)).toBeNull();
    expect(visualizadorDoDocumento([], true)).toBeNull();
  });
});
