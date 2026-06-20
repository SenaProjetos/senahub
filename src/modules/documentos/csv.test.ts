import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("interpreta a primeira linha como cabeçalho e as demais como linhas (separador vírgula)", () => {
    const r = parseCsv("nome,idade\nAna,30\nBruno,25");
    expect(r.colunas).toEqual(["nome", "idade"]);
    expect(r.linhas).toEqual([
      { nome: "Ana", idade: "30" },
      { nome: "Bruno", idade: "25" },
    ]);
  });

  it("detecta e usa ponto-e-vírgula como separador", () => {
    const r = parseCsv("nome;cidade\nAna;Recife\nBruno;São Paulo");
    expect(r.colunas).toEqual(["nome", "cidade"]);
    expect(r.linhas).toEqual([
      { nome: "Ana", cidade: "Recife" },
      { nome: "Bruno", cidade: "São Paulo" },
    ]);
  });

  it("suporta campo entre aspas contendo o separador", () => {
    const r = parseCsv('nome,obs\n"Silva, João","mora em São Paulo"');
    expect(r.colunas).toEqual(["nome", "obs"]);
    expect(r.linhas).toEqual([{ nome: "Silva, João", obs: "mora em São Paulo" }]);
  });

  it("suporta aspas duplas escapadas com \"\"", () => {
    const r = parseCsv('nome,frase\nAna,"diz ""olá"" sempre"');
    expect(r.linhas).toEqual([{ nome: "Ana", frase: 'diz "olá" sempre' }]);
  });

  it("normaliza CRLF e ignora linhas vazias", () => {
    const r = parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n");
    expect(r.colunas).toEqual(["a", "b"]);
    expect(r.linhas).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("retorna vazio para texto em branco", () => {
    expect(parseCsv("")).toEqual({ colunas: [], linhas: [] });
    expect(parseCsv("   \n  ")).toEqual({ colunas: [], linhas: [] });
  });

  it("preenche campos ausentes com string vazia", () => {
    const r = parseCsv("a,b,c\n1,2");
    expect(r.linhas).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("preserva quebra de linha dentro de aspas", () => {
    const r = parseCsv('nome,obs\nAna,"linha1\nlinha2"');
    expect(r.linhas).toEqual([{ nome: "Ana", obs: "linha1\nlinha2" }]);
  });
});
