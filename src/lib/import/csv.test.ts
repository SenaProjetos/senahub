import { describe, it, expect } from "vitest";
import { parseCsv, detectarDelimitador } from "@/lib/import/csv";

describe("detectarDelimitador", () => {
  it("prefere ; (padrão BR)", () => {
    expect(detectarDelimitador("a;b;c\n1;2;3")).toBe(";");
  });
  it("usa , quando não há ;", () => {
    expect(detectarDelimitador("a,b,c\n1,2,3")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("parseia linhas e colunas com ;", () => {
    const m = parseCsv("Tipo;Valor\nDespesa;-9,90\nReceita;100");
    expect(m).toEqual([
      ["Tipo", "Valor"],
      ["Despesa", "-9,90"],
      ["Receita", "100"],
    ]);
  });
  it("remove BOM do início", () => {
    const m = parseCsv("﻿a;b\n1;2");
    expect(m[0]).toEqual(["a", "b"]);
  });
  it("respeita aspas com delimitador e escape interno", () => {
    const m = parseCsv('nome;obs\n"Silva, João";"disse ""oi"""');
    expect(m[1]).toEqual(["Silva, João", 'disse "oi"']);
  });
  it("aspas com quebra de linha interna", () => {
    const m = parseCsv('a;b\n"linha1\nlinha2";x');
    expect(m[1]).toEqual(["linha1\nlinha2", "x"]);
  });
  it("descarta linhas totalmente vazias", () => {
    const m = parseCsv("a;b\n\n1;2\n");
    expect(m).toHaveLength(2);
  });
});
