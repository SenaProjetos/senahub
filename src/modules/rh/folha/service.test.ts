import { describe, expect, it } from "vitest";
import { renderHoleriteHtml, type HoleritePdf } from "./service";

/**
 * `renderHoleriteHtml` — foco no timbrado (achado ao vivo no primeiro import real: o PDF saía
 * sem nenhuma identificação do empregador, plano 2026-09-13-folha-clt-import-assinatura.md §7).
 */

const BASE: HoleritePdf = {
  id: "h1",
  nomeFuncionario: "Fulana da Silva",
  ano: 2026,
  mes: 8,
  itens: [{ descricao: "Salário base", tipo: "provento", valor: 3000 }],
  assinadoEm: null,
  assinanteNome: null,
  empresa: null,
};

describe("renderHoleriteHtml — timbrado", () => {
  it("sem dados de empresa configurados, sai sem timbrado (não quebra o PDF)", () => {
    const html = renderHoleriteHtml(BASE);
    expect(html).not.toContain('<div class="timbrado">');
    expect(html).toContain("HOLERITE — Fulana da Silva");
  });

  it("com dados de empresa, mostra razão social + CNPJ + endereço antes do nome do funcionário", () => {
    const html = renderHoleriteHtml({
      ...BASE,
      empresa: {
        razaoSocial: "Sena Estruturas Engenharia Ltda.",
        cnpj: "00.000.000/0001-00",
        endereco: "Rua Example, 123 — Cidade/UF",
        logoDataUri: null,
      },
    });
    expect(html).toContain("Sena Estruturas Engenharia Ltda.");
    expect(html).toContain("00.000.000/0001-00");
    expect(html).toContain("Rua Example, 123 — Cidade/UF");
    const posTimbrado = html.indexOf("Sena Estruturas");
    const posNome = html.indexOf("HOLERITE — Fulana da Silva");
    expect(posTimbrado).toBeGreaterThan(-1);
    expect(posTimbrado).toBeLessThan(posNome);
  });

  it("sem CNPJ nem endereço preenchidos, mostra só a razão social (sem linha vazia)", () => {
    const html = renderHoleriteHtml({
      ...BASE,
      empresa: { razaoSocial: "Sena Estruturas", cnpj: null, endereco: null, logoDataUri: null },
    });
    expect(html).toContain("Sena Estruturas");
    expect(html).not.toContain('<p class="timbrado-linha">');
  });

  it("com logo, embute a data URI num <img> (puppeteer não tem sessão pra baixar de uma rota)", () => {
    const html = renderHoleriteHtml({
      ...BASE,
      empresa: {
        razaoSocial: "Sena Estruturas",
        cnpj: null,
        endereco: null,
        logoDataUri: "data:image/png;base64,AAAA",
      },
    });
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
  });

  it("escapa razão social/CNPJ/endereço contra HTML injetado", () => {
    const html = renderHoleriteHtml({
      ...BASE,
      empresa: {
        razaoSocial: '<script>alert(1)</script>',
        cnpj: null,
        endereco: null,
        logoDataUri: null,
      },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
