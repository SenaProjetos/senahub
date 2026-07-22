import { describe, expect, it } from "vitest";
import { montarRelatorioClashHtml } from "@/modules/coordenacao/relatorio-clash";

const meta = { projetoCodigo: "P.001", projetoNome: "Projeto Teste", geradoEm: "22/07/2026 10:00" };

describe("montarRelatorioClashHtml", () => {
  it("sem itens: documento válido com mensagem de vazio", () => {
    const html = montarRelatorioClashHtml([], meta);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Nenhum conflito selecionado.");
    expect(html).toContain("P.001");
  });

  it("um item: inclui número, disciplinas, profundidade e imagem", () => {
    const html = montarRelatorioClashHtml(
      [
        {
          numero: 1,
          disciplinaA: "Estrutural",
          disciplinaB: "Hidráulica",
          profundidade: "0,05 m",
          imagemDataUrl: "data:image/png;base64,AAAA",
        },
      ],
      meta,
    );
    expect(html).toContain("Conflito #1");
    expect(html).toContain("Estrutural × Hidráulica");
    expect(html).toContain("0,05 m");
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it("escapa HTML em campos de texto (nomes de disciplina)", () => {
    const html = montarRelatorioClashHtml(
      [
        {
          numero: 1,
          disciplinaA: '<script>alert("x")</script>',
          disciplinaB: "B",
          profundidade: "0,01 m",
          imagemDataUrl: "data:image/png;base64,AAAA",
        },
      ],
      meta,
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("múltiplos itens geram múltiplas seções", () => {
    const itens = [1, 2, 3].map((n) => ({
      numero: n,
      disciplinaA: "A",
      disciplinaB: "B",
      profundidade: "0,01 m",
      imagemDataUrl: "data:image/png;base64,AAAA",
    }));
    const html = montarRelatorioClashHtml(itens, meta);
    expect(html.match(/Conflito #/g)).toHaveLength(3);
  });
});
