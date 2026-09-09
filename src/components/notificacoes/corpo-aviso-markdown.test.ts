import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CorpoAvisoMarkdown from "./corpo-aviso-markdown";

/**
 * Sem JSX de propósito: o `include` do vitest é `src/**\/*.test.ts` (não .tsx), então o
 * teste usa `createElement` em vez de mexer na config compartilhada por 273 arquivos.
 */
const render = (corpo: string) => renderToStaticMarkup(createElement(CorpoAvisoMarkdown, { corpo }));

describe("CorpoAvisoMarkdown — formatação", () => {
  it("negrito e itálico viram tag", () => {
    const html = render("**forte** e _torto_");
    expect(html).toContain("<strong");
    expect(html).toContain("<em");
  });

  it("título vira texto grande em negrito (os 'tamanhos' da barra)", () => {
    expect(render("# Grande")).toContain("text-lg");
    expect(render("## Menor")).toContain("text-base");
  });

  it("lista vira <ul>/<li>", () => {
    const html = render("- um\n- dois");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
  });

  it("quebra de linha simples é preservada (remark-breaks, igual ao e-mail)", () => {
    expect(render("linha um\nlinha dois")).toContain("<br");
  });
});

describe("CorpoAvisoMarkdown — travas de segurança", () => {
  it("HTML cru sai como texto escapado, não como tag", () => {
    const html = render('<script>alert(1)</script><img src=x onerror="alert(1)">');
    // Nenhuma tag viva: o `<` do que o usuário digitou vira sempre `&lt;`.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // `onerror` até aparece — dentro do texto escapado, inerte, nunca como atributo.
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("link com javascript: não vira âncora — sobra só o texto", () => {
    const html = render("[clique aqui](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("clique aqui");
  });

  it("link http também é desmontado (a barra não oferece link)", () => {
    const html = render("veja o [manual](https://exemplo.com)");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("exemplo.com");
    expect(html).toContain("manual");
  });

  it("imagem remota não é renderizada (nada de pixel de rastreio)", () => {
    const html = render("![](https://malvado.example/px.png)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("malvado.example");
  });
});
