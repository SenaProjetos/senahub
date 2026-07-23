import { describe, it, expect } from "vitest";
import DxfParser from "dxf-parser";
import { converterParaCena } from "@/modules/dwg/parse";

/** Monta um DXF minimo a partir de pares (code, valor) — evita repetir a serialização à mão em cada teste. */
function dxf(...pares: (string | number)[]): string {
  return pares.map(String).join("\n");
}

describe("converterParaCena", () => {
  it("converte LINE, CIRCLE, ARC, LWPOLYLINE fechada e TEXT", () => {
    const texto = dxf(
      0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "0", 10, "0.0", 20, "0.0", 30, "0.0", 11, "10.0", 21, "0.0", 31, "0.0",
      0, "CIRCLE", 8, "0", 10, "5.0", 20, "5.0", 30, "0.0", 40, "2.5",
      0, "ARC", 8, "0", 10, "0.0", 20, "0.0", 30, "0.0", 40, "3.0", 50, "0.0", 51, "90.0",
      0, "LWPOLYLINE", 8, "0", 90, "4", 70, "1",
      10, "0.0", 20, "0.0",
      10, "20.0", 20, "0.0",
      10, "20.0", 20, "10.0",
      10, "0.0", 20, "10.0",
      0, "TEXT", 8, "0", 10, "0.0", 20, "-5.0", 30, "0.0", 40, "2.5", 1, "OLA",
      0, "ENDSEC",
      0, "EOF",
    );
    const parser = new DxfParser();
    const parsed = parser.parseSync(texto);
    expect(parsed).not.toBeNull();
    const cena = converterParaCena(parsed!);

    expect(cena.primitivas).toEqual([
      { tipo: "linha", p1: { x: 0, y: 0, z: 0 }, p2: { x: 10, y: 0, z: 0 }, camada: "0" },
      { tipo: "circulo", centro: { x: 5, y: 5, z: 0 }, raio: 2.5, camada: "0" },
      { tipo: "arco", centro: { x: 0, y: 0, z: 0 }, raio: 3, a0: 0, a1: 90, camada: "0" },
      { tipo: "polilinha", pontos: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], fechada: true, camada: "0" },
      { tipo: "texto", p: { x: 0, y: -5, z: 0 }, altura: 2.5, conteudo: "OLA", rotacao: 0, camada: "0" },
    ]);
  });

  it("achata MTEXT (quebra de parágrafo \\P vira espaço)", () => {
    const texto = dxf(
      0, "SECTION", 2, "ENTITIES",
      0, "MTEXT", 8, "0", 10, "5.0", 20, "5.0", 30, "0.0", 40, "3.0", 1, "LINHA1\\PLINHA2",
      0, "ENDSEC",
      0, "EOF",
    );
    const parsed = new DxfParser().parseSync(texto);
    const cena = converterParaCena(parsed!);
    expect(cena.primitivas).toEqual([
      { tipo: "texto", p: { x: 5, y: 5, z: 0 }, altura: 3, conteudo: "LINHA1 LINHA2", rotacao: 0, camada: "0" },
    ]);
  });

  it("ignora entidade não suportada (HATCH) sem quebrar o parse das vizinhas", () => {
    const texto = dxf(
      0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "0", 10, "0.0", 20, "0.0", 30, "0.0", 11, "1.0", 21, "0.0", 31, "0.0",
      0, "HATCH", 8, "0", 70, "1", 91, "0",
      0, "CIRCLE", 8, "0", 10, "1.0", 20, "1.0", 30, "0.0", 40, "1.0",
      0, "ENDSEC",
      0, "EOF",
    );
    const parsed = new DxfParser().parseSync(texto);
    const cena = converterParaCena(parsed!);
    expect(cena.primitivas.map((p) => p.tipo)).toEqual(["linha", "circulo"]);
  });

  it("achata INSERT (translação + rotação + escala do bloco referenciado)", () => {
    const texto = dxf(
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 8, "0", 2, "PORTA", 70, "0", 10, "0.0", 20, "0.0", 30, "0.0", 3, "PORTA",
      0, "LINE", 8, "0", 10, "0.0", 20, "0.0", 30, "0.0", 11, "10.0", 21, "0.0", 31, "0.0",
      0, "ENDBLK",
      0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 8, "0", 2, "PORTA", 10, "100.0", 20, "50.0", 30, "0.0", 41, "2.0", 42, "2.0", 50, "90.0",
      0, "ENDSEC",
      0, "EOF",
    );
    const parsed = new DxfParser().parseSync(texto);
    const cena = converterParaCena(parsed!);
    expect(cena.primitivas).toEqual([
      { tipo: "linha", p1: { x: 100, y: 50 }, p2: { x: 100, y: 70 }, camada: "0" },
    ]);
  });

  it("lista camadas com flag de visibilidade (cor negativa na tabela LAYER = oculta)", () => {
    const texto = dxf(
      0, "SECTION", 2, "TABLES",
      0, "TABLE", 2, "LAYER", 70, "2",
      0, "LAYER", 2, "0", 70, "0", 62, "7", 6, "CONTINUOUS",
      0, "LAYER", 2, "OCULTA", 70, "0", 62, "-3", 6, "CONTINUOUS",
      0, "ENDTAB",
      0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "OCULTA", 10, "0.0", 20, "0.0", 30, "0.0", 11, "1.0", 21, "0.0", 31, "0.0",
      0, "ENDSEC",
      0, "EOF",
    );
    const parsed = new DxfParser().parseSync(texto);
    const cena = converterParaCena(parsed!);
    expect(cena.camadas).toEqual(
      expect.arrayContaining([
        { nome: "0", visivel: true },
        { nome: "OCULTA", visivel: false },
      ]),
    );
  });

  it("inclui camada usada por entidade mas ausente da tabela LAYER", () => {
    const texto = dxf(
      0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "SEM_TABELA", 10, "0.0", 20, "0.0", 30, "0.0", 11, "1.0", 21, "0.0", 31, "0.0",
      0, "ENDSEC",
      0, "EOF",
    );
    const parsed = new DxfParser().parseSync(texto);
    const cena = converterParaCena(parsed!);
    expect(cena.camadas).toEqual([{ nome: "SEM_TABELA", visivel: true }]);
  });
});
