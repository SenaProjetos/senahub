import { describe, it, expect } from "vitest";
import { escaparHtml, markdownParaTexto } from "./formatacao";

describe("escaparHtml", () => {
  it("neutraliza tag e atributo de evento", () => {
    expect(escaparHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("escapa & antes dos demais (sem dupla escapada)", () => {
    expect(escaparHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });

  it("preserva a sintaxe Markdown", () => {
    expect(escaparHtml("**negrito** _itálico_ ## Título")).toBe("**negrito** _itálico_ ## Título");
  });
});

describe("markdownParaTexto", () => {
  it("tira marcadores de negrito e itálico", () => {
    expect(markdownParaTexto("**Atenção**: leia o _aviso_.")).toBe("Atenção: leia o aviso.");
  });

  it("tira títulos e junta em uma linha só", () => {
    expect(markdownParaTexto("## Manutenção\n\nSábado às 8h.")).toBe("Manutenção Sábado às 8h.");
  });

  it("desmonta lista mantendo os itens", () => {
    expect(markdownParaTexto("- um\n- dois\n- três")).toBe("um dois três");
  });

  it("mantém só o texto do link", () => {
    expect(markdownParaTexto("veja o [manual](https://x.com/y)")).toBe("veja o manual");
  });

  it("texto sem formatação passa igual", () => {
    expect(markdownParaTexto("Reunião amanhã.")).toBe("Reunião amanhã.");
  });

  it("não deixa marcador sobrando em corpo misto", () => {
    const saida = markdownParaTexto("# 5S\n\n1. **Seiri** — Utilização\n2. _Seiton_ — Organização");
    expect(saida).toBe("5S Seiri — Utilização Seiton — Organização");
  });
});
