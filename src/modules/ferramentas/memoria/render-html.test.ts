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
