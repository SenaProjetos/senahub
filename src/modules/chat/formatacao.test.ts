import { describe, it, expect } from "vitest";
import {
  parseFormatacao,
  removerFormatacao,
  partesComLink,
  removerReferencias,
  textoParaPreview,
} from "./formatacao";

const seg = (
  texto: string,
  f: Partial<{ negrito: boolean; italico: boolean; sublinhado: boolean; codigo: boolean }> = {},
) => ({
  texto,
  negrito: false,
  italico: false,
  sublinhado: false,
  codigo: false,
  ...f,
});

describe("parseFormatacao", () => {
  it("texto simples vira um único segmento sem formatação", () => {
    expect(parseFormatacao("oi mundo")).toEqual([seg("oi mundo")]);
  });

  it("string vazia devolve lista vazia", () => {
    expect(parseFormatacao("")).toEqual([]);
  });

  it("negrito com *", () => {
    expect(parseFormatacao("*forte*")).toEqual([seg("forte", { negrito: true })]);
  });

  it("itálico com _ e sublinhado com ~", () => {
    expect(parseFormatacao("_i_")).toEqual([seg("i", { italico: true })]);
    expect(parseFormatacao("~s~")).toEqual([seg("s", { sublinhado: true })]);
  });

  it("código com crase", () => {
    expect(parseFormatacao("`x.frag`")).toEqual([seg("x.frag", { codigo: true })]);
  });

  it("código é literal — não reinterpreta marcadores no interior", () => {
    expect(parseFormatacao("`a*b*c`")).toEqual([seg("a*b*c", { codigo: true })]);
  });

  it("mistura texto e marcador preservando o entorno", () => {
    expect(parseFormatacao("diga *oi* pra mim")).toEqual([
      seg("diga "),
      seg("oi", { negrito: true }),
      seg(" pra mim"),
    ]);
  });

  it("aninha negrito + itálico", () => {
    expect(parseFormatacao("*_ambos_*")).toEqual([seg("ambos", { negrito: true, italico: true })]);
  });

  it("não formata marcador solto (sem par de fechamento)", () => {
    expect(parseFormatacao("2 * 3 = 6")).toEqual([seg("2 * 3 = 6")]);
  });

  it("não formata quando há espaço colado ao marcador", () => {
    expect(parseFormatacao("* nao *")).toEqual([seg("* nao *")]);
  });

  it("um único underscore em identificador não vira itálico", () => {
    expect(parseFormatacao("arquivo_final")).toEqual([seg("arquivo_final")]);
  });

  it("preserva menções dentro do trecho formatado", () => {
    const segs = parseFormatacao("*oi @joao*");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ texto: "oi @joao", negrito: true });
  });
});

describe("removerFormatacao", () => {
  it("tira os marcadores mantendo o texto", () => {
    expect(removerFormatacao("*oi* _tudo_ ~bem~ `cod`")).toBe("oi tudo bem cod");
  });

  it("texto sem formatação fica igual", () => {
    expect(removerFormatacao("nada aqui")).toBe("nada aqui");
  });
});

describe("referências internas", () => {
  it("partesComLink separa link interno do texto", () => {
    expect(partesComLink("veja [Proj 1](/projetos/abc) ok")).toEqual([
      { tipo: "texto", texto: "veja " },
      { tipo: "link", label: "Proj 1", href: "/projetos/abc" },
      { tipo: "texto", texto: " ok" },
    ]);
  });

  it("ignora links externos (não começam com /)", () => {
    const partes = partesComLink("[x](https://evil.com)");
    expect(partes).toEqual([{ tipo: "texto", texto: "[x](https://evil.com)" }]);
  });

  it("removerReferencias deixa só o rótulo", () => {
    expect(removerReferencias("abrir [Doc](/documentos/1)")).toBe("abrir Doc");
  });

  it("textoParaPreview tira formatação e referência", () => {
    expect(textoParaPreview("*ver* [Proj](/projetos/1)")).toBe("ver Proj");
  });
});
