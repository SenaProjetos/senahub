import { describe, it, expect } from "vitest";
import { linhaCsv, arquivoCsv } from "@/lib/export/csv";

describe("linhaCsv", () => {
  it("junta células com ';' (não ',')", () => {
    expect(linhaCsv(["a", "b", "c"])).toBe("a;b;c");
  });

  it("célula com ';' vira aspas", () => {
    expect(linhaCsv(["Acme; Ltda", "ok"])).toBe('"Acme; Ltda";ok');
  });

  it("célula com aspas escapa dobrando ('' )", () => {
    expect(linhaCsv(['Diz "oi"'])).toBe('"Diz ""oi"""');
  });

  it("célula com quebra de linha vira aspas", () => {
    expect(linhaCsv(["linha1\nlinha2"])).toBe('"linha1\nlinha2"');
  });

  it("null/undefined viram célula vazia, não a string 'null'", () => {
    expect(linhaCsv([null, undefined, "x"])).toBe(";;x");
  });

  it("boolean vira sim/não, não 'true'/'false'", () => {
    expect(linhaCsv([true, false])).toBe("sim;não");
  });

  it("número não é tocado (sem aspas, sem separador de milhar)", () => {
    expect(linhaCsv([1234.5])).toBe("1234.5");
  });
});

describe("arquivoCsv", () => {
  it("começa com BOM UTF-8", () => {
    const out = arquivoCsv(["a"], [["1"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });

  it("cabeçalho é a 1ª linha, dados nas seguintes, separadas por CRLF", () => {
    const out = arquivoCsv(["nome", "email"], [["Ana", "ana@x.com"], ["Bia", "bia@x.com"]]);
    const semBom = out.slice(1);
    expect(semBom.split("\r\n")).toEqual(["nome;email", "Ana;ana@x.com", "Bia;bia@x.com"]);
  });

  it("sem linhas, ainda assim devolve só o cabeçalho", () => {
    const out = arquivoCsv(["a", "b"], []);
    expect(out.slice(1)).toBe("a;b");
  });
});
