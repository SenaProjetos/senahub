import { describe, it, expect } from "vitest";
import { renderMemoriaHtml } from "./render-html";
import type { MemoriaDoc } from "./types";

const doc = (extra: Partial<MemoriaDoc>): MemoriaDoc => ({
  ferramenta: "x",
  titulo: "T",
  geradoEm: new Date("2026-07-27T12:00:00Z").toISOString(),
  disclaimer: "d",
  secoes: [],
  ...extra,
});

describe("renderMemoriaHtml — imagens de seção", () => {
  it("injeta o SVG inline da seção no HTML", () => {
    const html = renderMemoriaHtml(
      doc({ secoes: [{ titulo: "Diagrama", imagens: [{ titulo: "Tensões", svg: '<svg id="probe"></svg>' }] }] }),
    );
    expect(html).toContain('id="probe"');
    expect(html).toContain("Tensões");
  });

  it("não emite <figure> quando a seção não tem imagens", () => {
    const html = renderMemoriaHtml(doc({ secoes: [{ titulo: "Só texto", paragrafos: ["a"] }] }));
    expect(html).not.toContain("<figure");
  });
});

describe("renderMemoriaHtml — cabeçalho técnico", () => {
  it("renderiza identificação e assinaturas quando fornecidas", () => {
    const html = renderMemoriaHtml(
      doc({
        identificacao: {
          obra: "Edifício Alfa",
          responsavel: "Eng. Fulano",
          registro: "CREA-SP 123456",
          art: "ART-000111",
          assinaturas: true,
        },
      }),
    );
    expect(html).toContain("Edifício Alfa");
    expect(html).toContain("CREA-SP 123456");
    expect(html).toContain("ART-000111");
    expect(html).toContain("Responsável técnico");
  });

  it("escapa o conteúdo da identificação", () => {
    const html = renderMemoriaHtml(doc({ identificacao: { obra: '<script>x</script>' } }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omite o bloco quando não há identificação", () => {
    const html = renderMemoriaHtml(doc({}));
    expect(html).not.toContain("table class=\"ident\"");
    expect(html).not.toContain("class=\"sig\"");
  });
});
