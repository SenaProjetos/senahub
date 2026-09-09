import { describe, it, expect } from "vitest";
import { markdownParaHtml } from "@/lib/email-markdown";
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

/**
 * O caminho do e-mail é `markdownParaHtml(escaparHtml(corpo))` (service.ts), com o corpo
 * ainda passando pelo template. São dois passes de escapada em série: o daqui e o do
 * `marked`. Testar as duas funções isoladas não prova que a composição sobrevive — e é
 * ela que sai no e-mail de toda a empresa.
 */
describe("corpo no pipeline do e-mail", () => {
  const email = (corpo: string) => markdownParaHtml(escaparHtml(corpo));

  it("formata negrito e itálico", () => {
    const html = email("**forte** e _torto_");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<em>torto</em>");
  });

  it("não escapa a entidade duas vezes (aspas e & saem legíveis)", () => {
    const html = email('Leia o **"aviso"** de A & B');
    expect(html).not.toContain("&amp;quot;");
    expect(html).not.toContain("&amp;amp;");
    expect(html).toContain("<strong>");
  });

  it("HTML cru não vira tag no e-mail", () => {
    const html = email('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("título e lista viram estrutura de verdade", () => {
    expect(email("## Manutenção")).toContain("<h2");
    expect(email("- um\n- dois")).toContain("<li>");
  });

  it("quebra de linha simples vira <br> (igual ao render em tela)", () => {
    expect(email("linha um\nlinha dois")).toContain("<br>");
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
