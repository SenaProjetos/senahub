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

  it("link externo não vira referência com rótulo: o endereço aparece como ele é", () => {
    const partes = partesComLink("[x](https://evil.com)");
    expect(partes).toEqual([
      { tipo: "texto", texto: "[x](" },
      { tipo: "url", texto: "https://evil.com", href: "https://evil.com" },
      { tipo: "texto", texto: ")" },
    ]);
  });

  it("recusa caminho que o navegador lê como outro site (// e /\\)", () => {
    expect(partesComLink("[Proj](//evil.com)").some((p) => p.tipo === "link")).toBe(false);
    expect(partesComLink("[Proj](/\\evil.com)").some((p) => p.tipo === "link")).toBe(false);
  });

  it("removerReferencias deixa só o rótulo", () => {
    expect(removerReferencias("abrir [Doc](/documentos/1)")).toBe("abrir Doc");
  });

  it("textoParaPreview tira formatação e referência", () => {
    expect(textoParaPreview("*ver* [Proj](/projetos/1)")).toBe("ver Proj");
  });
});

describe("endereços colados", () => {
  const url = (texto: string, href = texto) => ({ tipo: "url", texto, href });

  it("reconhece o link do Dropbox inteiro, com query string e underscores", () => {
    const link = "https://www.dropbox.com/scl/fo/s46wdtn9va2d0cvokme2c/AAK3gULL8y0MCjPnrUqajV8?rlkey=m9ypw8b6hazuhqvvprl76a2bd&st=wq47t652&dl=0";
    expect(partesComLink(link)).toEqual([url(link)]);
    const comUnderscore = "https://site.com/pasta_de_projeto_final/arq";
    expect(partesComLink(comUnderscore)).toEqual([url(comUnderscore)]);
  });

  it("separa o endereço do texto em volta", () => {
    expect(partesComLink("segue a pasta: https://x.com/a e confirma")).toEqual([
      { tipo: "texto", texto: "segue a pasta: " },
      url("https://x.com/a"),
      { tipo: "texto", texto: " e confirma" },
    ]);
  });

  it("www. vira https://", () => {
    expect(partesComLink("www.sena.com.br")).toEqual([url("www.sena.com.br", "https://www.sena.com.br")]);
  });

  it("pontuação do fim da frase fica fora do endereço", () => {
    expect(partesComLink("veja https://x.com/a.")).toEqual([
      { tipo: "texto", texto: "veja " },
      url("https://x.com/a"),
      { tipo: "texto", texto: "." },
    ]);
    expect(partesComLink("(https://x.com/a), ok")).toEqual([
      { tipo: "texto", texto: "(" },
      url("https://x.com/a"),
      { tipo: "texto", texto: "), ok" },
    ]);
  });

  it("parêntese equilibrado dentro do endereço fica", () => {
    const wiki = "https://pt.wikipedia.org/wiki/BIM_(construção)";
    expect(partesComLink(wiki)).toEqual([url(wiki)]);
  });

  it("vários endereços e referência interna na mesma mensagem", () => {
    expect(partesComLink("[Proj](/projetos/1) http://a.com e https://b.com")).toEqual([
      { tipo: "link", label: "Proj", href: "/projetos/1" },
      { tipo: "texto", texto: " " },
      url("http://a.com"),
      { tipo: "texto", texto: " e " },
      url("https://b.com"),
    ]);
  });

  it("não inventa link", () => {
    for (const t of ["javascript:alert(1)", "www.", "https://", "ftp://x.com", "arquivo.pdf", "xhttps://a.com"]) {
      expect(partesComLink(t).every((p) => p.tipo === "texto"), t).toBe(true);
    }
  });
});
