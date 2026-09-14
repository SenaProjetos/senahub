import { describe, it, expect } from "vitest";
import {
  textoRecibo,
  totalRecibo,
  competenciaRecibo,
  renderReciboHtml,
  type ItemRecibo,
} from "@/modules/financeiro/recibo/service";
import { brl } from "@/lib/utils";

const item = (over: Partial<ItemRecibo> = {}): ItemRecibo => ({
  projetoCodigo: "260018",
  projetoNome: "Edifício Aurora",
  disciplina: "Estrutural",
  liberadoEm: new Date("2026-04-10T00:00:00.000Z"),
  pagoEm: new Date("2026-05-02T00:00:00.000Z"),
  valor: 1500,
  ...over,
});

const base = {
  tipo: "mensal" as const,
  projetistaNome: "Ana Silva",
  ano: 2026,
  mes: 4,
  emitidoEm: new Date("2026-05-03T00:00:00.000Z"),
};

describe("totalRecibo", () => {
  it("soma os itens (o valor do recibo nunca é digitado)", () => {
    expect(totalRecibo([item(), item({ valor: 500.5 })])).toBe(2000.5);
  });
  it("recibo sem item vale zero", () => {
    expect(totalRecibo([])).toBe(0);
  });
});

describe("competenciaRecibo", () => {
  it("mês e ano viram rótulo curto", () => {
    expect(competenciaRecibo(2026, 4)).toBe("abr/2026");
  });
  it("sem competência (individual) ou mês inválido devolve null", () => {
    expect(competenciaRecibo(null, null)).toBeNull();
    expect(competenciaRecibo(2026, 13)).toBeNull();
    expect(competenciaRecibo(2026, 0)).toBeNull();
  });
});

describe("textoRecibo", () => {
  it("traz nome, competência, quantidade e total", () => {
    const t = textoRecibo({ ...base, itens: [item(), item({ valor: 500 })] });
    expect(t).toContain("Projetista: Ana Silva");
    expect(t).toContain("Competência: abr/2026");
    expect(t).toContain("Entregas: 2");
    // Compara com a própria formatação do repo: `brl` usa espaço não separável (U+00A0),
    // então fixar "R$ 2.000,00" no teste quebra por um caractere invisível.
    expect(t).toContain(brl(2000));
  });
  it("individual não mostra competência mesmo se vier ano/mês", () => {
    const t = textoRecibo({ ...base, tipo: "individual", itens: [item()] });
    expect(t).not.toContain("Competência:");
  });
  it("cada entrega vira uma linha com projeto, disciplina e datas", () => {
    const t = textoRecibo({ ...base, itens: [item()] });
    expect(t).toContain("260018 · Edifício Aurora — Estrutural");
    expect(t).toContain("liberado em 10/04/2026");
    expect(t).toContain("pago em 02/05/2026");
  });
  it("entrega sem data de pagamento é dita, não omitida", () => {
    expect(textoRecibo({ ...base, itens: [item({ pagoEm: null })] })).toContain("pagamento sem data");
  });
  it("é determinístico — mesmo dado, mesmo texto (senão o hash não serviria de prova)", () => {
    const dados = { ...base, itens: [item()] };
    expect(textoRecibo(dados)).toBe(textoRecibo(dados));
  });
  it("traz a declaração de quitação", () => {
    expect(textoRecibo({ ...base, itens: [item()] })).toContain("dou plena quitação");
  });
});

describe("renderReciboHtml", () => {
  const pdf = {
    numero: "abc123",
    texto: "RECIBO\nlinha <b>com</b> símbolo & aspas \"x\"",
    textoHash: "deadbeef",
    assinadoEm: null,
    assinanteNome: null,
    empresa: null,
  };
  it("escapa o texto gravado em vez de injetar HTML", () => {
    const html = renderReciboHtml(pdf);
    expect(html).toContain("&lt;b&gt;com&lt;/b&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<b>com</b>");
  });
  it("não assinado aparece como pendente, e assinado mostra quem e quando", () => {
    expect(renderReciboHtml(pdf)).toContain("ainda não assinado");
    const assinado = renderReciboHtml({
      ...pdf,
      assinadoEm: new Date("2026-05-04T00:00:00.000Z"),
      assinanteNome: "Ana Silva",
    });
    expect(assinado).toContain("Assinado eletronicamente por Ana Silva");
    expect(assinado).toContain("04/05/2026");
  });
  it("o hash vai no rodapé como código de verificação", () => {
    expect(renderReciboHtml(pdf)).toContain("deadbeef");
  });
  it("timbrado da empresa vai ANTES do texto assinado e fora dele (o hash do texto não muda)", () => {
    const html = renderReciboHtml({
      ...pdf,
      empresa: { razaoSocial: "Sena Estruturas", cnpj: "00.000.000/0001-00", endereco: null, logoDataUri: null },
    });
    const posTimbrado = html.indexOf('<div class="timbrado">');
    const posPre = html.indexOf("<pre>");
    expect(posTimbrado).toBeGreaterThan(-1);
    expect(posTimbrado).toBeLessThan(posPre);
    const textoNoPdf = html.slice(posPre, html.indexOf("</pre>"));
    expect(textoNoPdf).not.toContain("Sena Estruturas");
    expect(textoNoPdf).not.toContain("00.000.000/0001-00");
  });
  it("sem empresa configurada, sai sem timbrado", () => {
    expect(renderReciboHtml(pdf)).not.toContain('<div class="timbrado">');
  });
});
