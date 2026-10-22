import { describe, expect, it } from "vitest";

import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import quadros from "./__fixtures__/quadros-revisao.json";
import { descricaoGenerica, lerQuadroDeRevisao, textoDaRevisao } from "./quadro-revisao";

// Itens reais da 1ª página das 12 pranchas de amostra (só o quadro de revisão e o campo REVISÃO,
// com cliente trocado por CLIENTE e pessoas por AUTOR).
const AMOSTRAS = quadros as { arquivo: string; itens: ItemTextoPdf[] }[];

function itensDe(prefixo: string): ItemTextoPdf[] {
  const achada = AMOSTRAS.find((a) => a.arquivo.startsWith(prefixo));
  if (!achada) throw new Error(`fixture ausente: ${prefixo}`);
  return achada.itens;
}

function revisao(prefixo: string, rev: number): string | null {
  const quadro = lerQuadroDeRevisao(itensDe(prefixo));
  expect(quadro).not.toBeNull();
  return textoDaRevisao(quadro!, rev);
}

describe("lerQuadroDeRevisao + textoDaRevisao — amostras reais", () => {
  it("PECR3-ELE-EX-009-ILU (modelo A, girado): R01 = linha 02", () => {
    expect(revisao("PECR3-ELE-EX-009-ILU", 1)).toBe("REVISÃO ARQUITETURA TÉRREO");
  });
  it("PAAUM-HID-EX-001-SAF-TER (modelo A, normal)", () => {
    expect(revisao("PAAUM-HID-EX-001-SAF-TER", 1)).toBe("PRESSURIZAÇÃO AGUA FRIA");
  });
  it("PAGUA-ELE-EX-003-TOM (modelo A)", () => {
    expect(revisao("PAGUA-ELE-EX-003-TOM", 1)).toBe("REV 01: ARQ");
  });
  it("2525-EST-EX-DTC-433 (modelo B, palavra por palavra)", () => {
    expect(revisao("2525-EST-EX-DTC-433", 1)).toBe("ALTERAÇÃO DAS LAJES DO MEZANINO");
  });
  it("25102_EST_EX_DTC_4001 (modelo B): o autor na coluna DESENHO não entra", () => {
    expect(revisao("25102_EST_EX_DTC_4001", 1)).toMatch(/^REVISÃO DA LOCAÇÃO DOS BLOCOS/);
  });
  it("PECR3-PCI-EX-005-DET (modelo B)", () => {
    expect(revisao("PECR3-PCI-EX-005-DET", 1)).toBe("ADEQUAÇÃO A ARQUITETURA");
  });
  it("PEDF3-ELE-EX-003 e -004 (modelo B, girado)", () => {
    expect(revisao("PEDF3-ELE-EX-003", 1)).toMatch(/^CONFORME DOCUMENTO"/);
    expect(revisao("PEDF3-ELE-EX-004", 1)).toMatch(/^CONFORME DOCUMENTO"/);
  });
  it("2382-PMP-UBS-EST-07-EMFM (modelo C, prefeitura): R02 e R00", () => {
    expect(revisao("2382-PMP-UBS-EST-07-EMFM", 2)).toBe("REVISÃO DE DETALHES");
    expect(revisao("2382-PMP-UBS-EST-07-EMFM", 0)).toBe("EMISSÃO INICIAL");
  });
  it("PECAR-ARQ-PE-006-CRT (modelo D, cabeçalho em cima, célula em 3 linhas)", () => {
    const texto = revisao("PECAR-ARQ-PE-006-CRT", 1);
    expect(texto).toMatch(/^Mudança dos ambientes Self Velo e Self Intense\./);
    expect(texto).toContain("Realocação de luminárias");
    expect(texto).toContain("espelhos; Indicação de enchimento");
  });
  it("2558_HDR_EX_6001_DTC: linha da R01 vazia = null; R00 = EMISSÃO INICIAL", () => {
    expect(revisao("2558_HDR_EX_6001_DTC", 1)).toBeNull();
    expect(revisao("2558_HDR_EX_6001_DTC", 0)).toBe("EMISSÃO INICIAL");
  });
  it("2558_CLM_EX_8006_DTC: sem âncora, a linha 01 é a R01", () => {
    expect(revisao("2558_CLM_EX_8006_DTC", 1)).toBe("REVISÕES");
  });
  it("nenhuma linha de nenhuma amostra traz a coluna do autor", () => {
    for (const { arquivo, itens } of AMOSTRAS) {
      const quadro = lerQuadroDeRevisao(itens);
      expect(quadro, arquivo).not.toBeNull();
      for (const linha of quadro!.linhas) expect(linha.texto, arquivo).not.toContain("AUTOR");
    }
  });
});

describe("lerQuadroDeRevisao — casos de borda", () => {
  it("sem itens = null", () => {
    expect(lerQuadroDeRevisao([])).toBeNull();
  });
  it("cabeçalho sem linhas numeradas = null", () => {
    const itens: ItemTextoPdf[] = [
      { str: "REV", x: 100, y: 100, w: 12, h: 6, pagina: 1 },
      { str: "DESCRIÇÃO", x: 200, y: 100, w: 35, h: 6, pagina: 1 },
    ];
    expect(lerQuadroDeRevisao(itens)).toBeNull();
  });
  it("linhas ordenadas por número", () => {
    const quadro = lerQuadroDeRevisao(itensDe("2525-EST-EX-DTC-433"));
    expect(quadro!.linhas.map((l) => l.numero)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("textoDaRevisao", () => {
  const q = { linhas: [{ numero: 1, texto: "EMISSÃO INICIAL" }, { numero: 2, texto: "AJUSTE" }, { numero: 3, texto: "" }] };
  it("âncora EMISSÃO INICIAL conta a partir dela", () => {
    expect(textoDaRevisao(q, 0)).toBe("EMISSÃO INICIAL");
    expect(textoDaRevisao(q, 1)).toBe("AJUSTE");
  });
  it("linha vazia ou ausente = null", () => {
    expect(textoDaRevisao(q, 2)).toBeNull();
    expect(textoDaRevisao(q, 7)).toBeNull();
  });
  it("sem âncora, o número da linha é a revisão", () => {
    expect(textoDaRevisao({ linhas: [{ numero: 1, texto: "X" }] }, 1)).toBe("X");
    expect(textoDaRevisao({ linhas: [{ numero: 1, texto: "X" }] }, 0)).toBeNull();
  });
});

describe("descricaoGenerica", () => {
  it.each(["REVISÕES", "Revisão", "ALTERAÇÕES GERAIS", "REV 01 - AJUSTES", "EMISSÃO INICIAL", "Correções.", ""])(
    "%j é genérica",
    (texto) => expect(descricaoGenerica(texto)).toBe(true),
  );
  it.each(["REV 01: ARQ", "REVISÃO DE DETALHES", "REVISÃO ARQUITETURA TÉRREO", "ALTERAÇÃO DAS LAJES DO MEZANINO"])(
    "%j é específica",
    (texto) => expect(descricaoGenerica(texto)).toBe(false),
  );
});
