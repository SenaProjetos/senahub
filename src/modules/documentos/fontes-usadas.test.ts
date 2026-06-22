import { describe, it, expect } from "vitest";
import { fontesUsadasNoSchema, bandaTemFontePropria } from "./fontes-usadas";
import type { DocSchema } from "./schema";

function schema(bandas: Partial<DocSchema["bandas"][number]>[] = []): DocSchema {
  return {
    versao: 1,
    pagina: { formato: "A4", orientacao: "retrato", largura: 794, altura: 1123, margem: { topo: 0, baixo: 0, esquerda: 0, direita: 0 } },
    bandas: bandas.map((b) => ({
      id: "b1",
      tipo: "detalhe",
      altura: 10,
      elementos: [],
      ...b,
    })) as DocSchema["bandas"],
  };
}

describe("fontesUsadasNoSchema", () => {
  it("retorna só a fonte primária quando sem bandas com fonteId", () => {
    const s = schema([{ tipo: "cabecalho" }, { tipo: "rodape" }]);
    expect(fontesUsadasNoSchema("projeto", s)).toEqual(["projeto"]);
  });

  it("inclui fonteId de banda detalhe após a primária", () => {
    const s = schema([{ tipo: "detalhe", fonteId: "disciplinas" }]);
    expect(fontesUsadasNoSchema("projeto", s)).toEqual(["projeto", "disciplinas"]);
  });

  it("inclui fonteId de grupoCabecalho e grupoRodape", () => {
    const s = schema([
      { tipo: "grupoCabecalho", fonteId: "grupo1" },
      { tipo: "grupoRodape", fonteId: "grupo2" },
    ]);
    expect(fontesUsadasNoSchema("projeto", s)).toEqual(["projeto", "grupo1", "grupo2"]);
  });

  it("ignora cabecalho/rodape simples (não iteram coleção)", () => {
    const s = schema([
      { tipo: "cabecalho", fonteId: "deve-ignorar" },
      { tipo: "rodape", fonteId: "deve-ignorar" },
      { tipo: "detalhe", fonteId: "disciplinas" },
    ]);
    expect(fontesUsadasNoSchema("projeto", s)).toEqual(["projeto", "disciplinas"]);
  });

  it("deduplicação: fonteId igual à primária não repete", () => {
    const s = schema([{ tipo: "detalhe", fonteId: "projeto" }]);
    expect(fontesUsadasNoSchema("projeto", s)).toEqual(["projeto"]);
  });

  it("deduplicação: fonteId repetida em várias bandas aparece uma vez", () => {
    const s = schema([
      { tipo: "detalhe", fonteId: "disciplinas" },
      { tipo: "grupoCabecalho", fonteId: "disciplinas" },
    ]);
    expect(fontesUsadasNoSchema("projeto", s)).toEqual(["projeto", "disciplinas"]);
  });

  it("primária nula é ignorada", () => {
    const s = schema([{ tipo: "detalhe", fonteId: "disciplinas" }]);
    expect(fontesUsadasNoSchema(null, s)).toEqual(["disciplinas"]);
  });

  it("primária e fonteId vazias → lista vazia", () => {
    expect(fontesUsadasNoSchema(null, schema([{ tipo: "detalhe", fonteId: "" }]))).toEqual([]);
  });

  it("sem bandas e sem primária → lista vazia", () => {
    expect(fontesUsadasNoSchema(undefined, schema([]))).toEqual([]);
  });
});

describe("bandaTemFontePropria", () => {
  it("detalhe tem fonte própria", () => {
    expect(bandaTemFontePropria("detalhe")).toBe(true);
  });
  it("grupoCabecalho e grupoRodape têm fonte própria", () => {
    expect(bandaTemFontePropria("grupoCabecalho")).toBe(true);
    expect(bandaTemFontePropria("grupoRodape")).toBe(true);
  });
  it("cabecalho e rodape NÃO têm fonte própria", () => {
    expect(bandaTemFontePropria("cabecalho")).toBe(false);
    expect(bandaTemFontePropria("rodape")).toBe(false);
  });
  it("tipo desconhecido retorna false", () => {
    expect(bandaTemFontePropria("xyz")).toBe(false);
  });
});
