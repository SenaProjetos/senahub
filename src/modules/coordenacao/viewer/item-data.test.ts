import { describe, it, expect } from "vitest";
import { extrairAtributos } from "@/modules/coordenacao/viewer/item-data";

describe("extrairAtributos", () => {
  it("retorna vazio para item ausente ou não-objeto", () => {
    expect(extrairAtributos(undefined)).toEqual({ atributos: [], psets: [] });
    expect(extrairAtributos(null)).toEqual({ atributos: [], psets: [] });
    expect(extrairAtributos("x")).toEqual({ atributos: [], psets: [] });
  });

  it("extrai atributos diretos (folhas { value })", () => {
    const { atributos } = extrairAtributos({
      Name: { value: "Viga V1" },
      _category: { value: "IFCBEAM" },
      Tag: { value: 274711 },
      relacaoQualquer: [{ Name: { value: "ignorar" } }],
    });
    expect(atributos).toEqual([
      { nome: "Name", valor: "Viga V1" },
      { nome: "_category", valor: "IFCBEAM" },
      { nome: "Tag", valor: "274711" },
    ]);
  });

  it("monta psets a partir de IsDefinedBy → HasProperties", () => {
    const { psets } = extrairAtributos({
      Name: { value: "Parede" },
      IsDefinedBy: [
        {
          Name: { value: "Pset_WallCommon" },
          HasProperties: [
            { Name: { value: "IsExternal" }, NominalValue: { value: true } },
            { Name: { value: "FireRating" }, NominalValue: { value: "REI 90" } },
            { SemNome: { value: "descartado" } },
          ],
        },
        { Name: { value: "PsetVazio" }, HasProperties: [] },
      ],
    });
    expect(psets).toEqual([
      {
        nome: "Pset_WallCommon",
        props: [
          { nome: "IsExternal", valor: "true" },
          { nome: "FireRating", valor: "REI 90" },
        ],
      },
    ]);
  });

  it("valores nulos/objetos viram texto legível", () => {
    const { atributos } = extrairAtributos({
      A: { value: null },
      B: { value: { x: 1 } },
    });
    expect(atributos).toEqual([
      { nome: "A", valor: "—" },
      { nome: "B", valor: '{"x":1}' },
    ]);
  });
});
