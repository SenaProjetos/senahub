import { describe, expect, it } from "vitest";
import { extrairTituloDoCarimbo } from "./titulo-carimbo";
import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";

/**
 * As coordenadas abaixo NÃO são inventadas: saíram do `getTextContent` dos PDFs de prancha reais
 * do acervo de dev (2026-09-17), justamente porque carimbo de CAD quebra a frase em vários itens
 * e às vezes vem deitado — fixture sintética "bonita" passaria e o arquivo real falharia.
 */
function item(str: string, x: number, y: number, w: number, h: number, giro = 0): ItemTextoPdf {
  return { str, x, y, w, h, pagina: 1, giro };
}

describe("extrairTituloDoCarimbo", () => {
  it("lê o título do carimbo deitado (260007-HID-EX-6001-DET.pdf, texto a 270°)", () => {
    const itens = [
      item("PROJETO:", 171.5, 533.9, 19.8, 4, 270),
      item("ÁREA:", 136.6, 533.2, 11.9, 4, 270),
      item("HIDROSSANITÁRIO", 131.5, 509.3, 55.1, 5.9, 270),
      item("ASSUNTO:", 118.9, 533.2, 20.2, 4, 270),
      item("PLANTA BAIXA E DETALHES - ÁGUA FRIA - TÉRREO", 108.8, 527.5, 148.2, 5.9, 270),
      item("RESPONSÁVEL TÉCNICO:", 87.2, 532.8, 44.5, 4, 270),
      item("CÓDIGO:", 54.8, 417.4, 17.2, 4, 270),
      item("260037-HDR-EX-6001-DET.DWG", 49.3, 379.4, 89.8, 5.9, 270),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBe("PLANTA BAIXA E DETALHES - ÁGUA FRIA - TÉRREO");
  });

  it("lê o mesmo carimbo quando a folha foi plotada sem giro (260007-HID-EX-6002-DET.pdf)", () => {
    const itens = [
      item("ENDEREÇO:", 1849.6, 153.6, 23.5, 4),
      item("ÁREA:", 1850.6, 136.6, 11.9, 4),
      item("HIDROSSANITÁRIO", 1874.5, 131.5, 55.1, 5.9),
      item("FASE:", 1986.8, 136.3, 11.4, 4),
      item("ASSUNTO:", 1850.6, 118.9, 20.2, 4),
      item("DETALHES - ÁGUA FRIA - TÉRREO", 1856.3, 108.8, 98.7, 5.9),
      item("UNIDADE:", 2068.2, 88.8, 18.9, 4),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBe("DETALHES - ÁGUA FRIA - TÉRREO");
  });

  it("remonta o valor que o CAD quebrou em palavras soltas (2527_EST_EX_DTC_4026_R00.pdf)", () => {
    const itens = [
      item("PROJETO:", 1515, -620.9, 50.6, 10.5),
      item("ASSUNTO:", 1515, -653.5, 50.6, 10.5),
      item("ESTRUTURA", 1549.5, -681.4, 73.2, 13.5),
      item("-", 1630.8, -681.4, 8.1, 13.5),
      item("COBERTA", 1647.1, -681.4, 57, 13.5),
      item("METÁLICA", 1712.2, -681.4, 65.1, 13.5),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBe("ESTRUTURA - COBERTA METÁLICA");
  });

  it("ignora 'ASSUNTO' sem dois-pontos — é cabeçalho de bloco, não campo (2578_ORO…, 25102_EST…)", () => {
    // Nesses carimbos de terceiros o que fica embaixo do cabeçalho é o nome do cliente/prefeitura.
    const itens = [
      item("ASSUNTO", 231, 348, 44, 9.5, 270),
      item("MUNICIPAL DE OROBÓ-PE", 208.5, 325.5, 95, 11, 270),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBeNull();
  });

  it("não aceita o código da prancha como título (célula vizinha do ASSUNTO no carimbo da SENA)", () => {
    const itens = [
      item("ASSUNTO:", 118.9, 533.2, 20.2, 4, 270),
      item("260037-HDR-EX-6001-DET.DWG", 113.4, 527.5, 89.8, 5.9, 270),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBeNull();
  });

  it("não confunde o rótulo da célula de baixo com valor", () => {
    const itens = [
      item("ASSUNTO:", 118.9, 533.2, 20.2, 4, 270),
      item("RESPONSÁVEL TÉCNICO:", 113.4, 527.5, 44.5, 4, 270),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBeNull();
  });

  it("devolve null sem camada de texto (PDF escaneado) ou sem rótulo de título", () => {
    expect(extrairTituloDoCarimbo([])).toBeNull();
    expect(extrairTituloDoCarimbo([item("PLANTA BAIXA - TÉRREO", 100, 100, 80, 6)])).toBeNull();
  });

  it("ignora valor de outra coluna, longe demais do rótulo (ARQ-LZ361…: nome do autor)", () => {
    const itens = [
      item("ASSUNTO:", 100, 500, 20, 5),
      item("Pedro de Carvalho Guadalupe", 272, 493.8, 90, 5),
    ];
    expect(extrairTituloDoCarimbo(itens)).toBeNull();
  });

  it("aceita as variações de rótulo do mesmo campo", () => {
    for (const rotulo of ["TÍTULO:", "TITULO DA PRANCHA:", "Nome da prancha:", "DESCRIÇÃO:"]) {
      const itens = [
        item(rotulo, 100, 500, 24, 5),
        item("PLANTA DE LOCAÇÃO E COBERTA", 102, 492, 95, 6),
      ];
      expect(extrairTituloDoCarimbo(itens)).toBe("PLANTA DE LOCAÇÃO E COBERTA");
    }
  });

  it("só olha a primeira página (prancha é uma folha; página 2 é outro desenho)", () => {
    const itens: ItemTextoPdf[] = [
      { ...item("ASSUNTO:", 100, 500, 20, 5), pagina: 2 },
      { ...item("PLANTA DA PÁGINA 2", 102, 492, 70, 6), pagina: 2 },
    ];
    expect(extrairTituloDoCarimbo(itens)).toBeNull();
  });
});
