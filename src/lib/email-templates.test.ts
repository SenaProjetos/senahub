import { describe, it, expect } from "vitest";
import { substituirVariaveis, markdownParaHtml } from "./email-templates";
import { TEMPLATES_CATALOGO, metaTemplate, exemplosDoTemplate } from "./email-templates-meta";

describe("substituirVariaveis", () => {
  it("substitui variáveis presentes", () => {
    expect(substituirVariaveis("Olá {{nome}}!", { nome: "Ana" })).toBe("Olá Ana!");
  });
  it("aceita espaços dentro das chaves", () => {
    expect(substituirVariaveis("R$ {{ valor }}", { valor: 10 })).toBe("R$ 10");
  });
  it("variável ausente vira string vazia", () => {
    expect(substituirVariaveis("[{{x}}]", {})).toBe("[]");
  });
  it("mantém texto sem variáveis", () => {
    expect(substituirVariaveis("sem tokens", { a: "1" })).toBe("sem tokens");
  });
});

describe("markdownParaHtml", () => {
  it("converte negrito e parágrafo", () => {
    const html = markdownParaHtml("Olá **mundo**");
    expect(html).toContain("<strong>mundo</strong>");
    expect(html).toContain("<p>");
  });
  it("converte tabela GFM", () => {
    const html = markdownParaHtml("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });
  it("converte link", () => {
    expect(markdownParaHtml("[x](https://a.b)")).toContain('<a href="https://a.b">');
  });
});

describe("catálogo de templates", () => {
  it("todo template renderiza sem sobrar tokens com seus exemplos", () => {
    for (const meta of TEMPLATES_CATALOGO) {
      const ex = exemplosDoTemplate(meta.slug);
      const assunto = substituirVariaveis(meta.assuntoPadrao, ex);
      const corpo = substituirVariaveis(meta.corpoPadrao, ex);
      expect(assunto, `assunto ${meta.slug}`).not.toMatch(/\{\{/);
      expect(corpo, `corpo ${meta.slug}`).not.toMatch(/\{\{/);
    }
  });
  it("slugs são únicos", () => {
    const slugs = TEMPLATES_CATALOGO.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("metaTemplate acha por slug e ignora desconhecido", () => {
    expect(metaTemplate("aviso-geral")?.label).toBe("Aviso geral");
    expect(metaTemplate("inexistente")).toBeUndefined();
  });
});
