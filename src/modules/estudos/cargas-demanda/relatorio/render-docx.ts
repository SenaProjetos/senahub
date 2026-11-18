import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { EmpresaTimbrado } from "@/modules/configuracoes/empresa/timbrado";

import { dataBR, textoDaCelula } from "./formato";
import { linhaDoTimbrado, logoDoTimbrado } from "./timbrado";
import { ehNum, type BlocoRel, type RelatorioCargas, type TabelaRel } from "./tipos";

/**
 * Word (.docx) do relatório de cargas e demanda — formato COMPACTO da spec §7: página A4, margens de 1,5 cm, fonte de 8 a 9 pt,
 * sem espaço entre parágrafos, tabelas compactas com cabeçalho cinza e valores centralizados, linhas de uma tabela na mesma
 * página, cabeçalho de tabela repetido se a tabela passar de página, rodapé "Página X de Y". Só este renderizador usa o
 * formato compacto (o PDF segue o renderizador comum das memórias).
 */

const FONTE = "Calibri";
const CORPO = 17; // 8,5 pt (meio-ponto)
const PEQUENO = 16; // 8 pt
const TITULO = 28; // 14 pt
const SECAO = 20; // 10 pt
const SUB = 18; // 9 pt
const MARGEM = 851; // 1,5 cm em twips
const CINZA = "D9D9D9";
const BORDA = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" } as const;
const SEM_ESPACO = { before: 0, after: 0 } as const;

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font: FONTE, size: o.size ?? CORPO, bold: o.bold, italics: o.italics, color: o.color });

function paragrafo(texto: string, o: { bold?: boolean; italics?: boolean; size?: number; antes?: number; depois?: number; alinhar?: (typeof AlignmentType)[keyof typeof AlignmentType]; manter?: boolean } = {}): Paragraph {
  return new Paragraph({ children: [run(texto, o)], spacing: { before: o.antes ?? 0, after: o.depois ?? 0 }, alignment: o.alinhar, keepNext: o.manter });
}

function celula(texto: string, o: { cab?: boolean; total?: boolean; esquerda?: boolean }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [run(texto, { bold: o.cab || o.total, size: PEQUENO })], alignment: o.esquerda ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: SEM_ESPACO })],
    shading: o.cab || o.total ? { type: ShadingType.CLEAR, color: "auto", fill: CINZA } : undefined,
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    borders: { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA },
  });
}

function tabelaDocx(t: TabelaRel): (Paragraph | Table)[] {
  const esquerda = t.primeiraColunaTexto !== false;
  const cab = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: t.colunas.map((c, i) => celula(c, { cab: true, esquerda: esquerda && i === 0 })),
  });
  const corpo = t.linhas.map((l, r) => {
    const total = t.ultimaEhTotal === true && r === t.linhas.length - 1;
    return new TableRow({
      cantSplit: true,
      height: { value: 0, rule: HeightRule.AUTO },
      children: l.map((c, i) => celula(textoDaCelula(c), { total, esquerda: !ehNum(c) && (esquerda ? i === 0 : false) })),
    });
  });
  const out: (Paragraph | Table)[] = [];
  if (t.titulo) out.push(paragrafo(t.titulo, { bold: true, size: SUB, antes: 80, depois: 20, manter: true }));
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: [cab, ...corpo] }));
  return out;
}

function blocoDocx(b: BlocoRel): (Paragraph | Table)[] {
  switch (b.tipo) {
    case "subtitulo":
      return [paragrafo(b.texto, { bold: true, size: SUB, antes: 120, depois: 20, manter: true })];
    case "texto":
      return [paragrafo(b.texto, { bold: b.negrito, antes: 20 })];
    case "lista":
      return b.itens.map((i) => new Paragraph({ children: [run(i)], bullet: { level: 0 }, spacing: SEM_ESPACO }));
    case "tabela":
      return tabelaDocx(b.tabela);
  }
}

/** Cabeçalho da página com o timbrado da empresa: logo e razão social na primeira linha; CNPJ e endereço na segunda, com filete embaixo. */
function cabecalhoDoTimbrado(e: EmpresaTimbrado): Header {
  const logo = logoDoTimbrado(e);
  const linha = linhaDoTimbrado(e);
  const primeira: (ImageRun | TextRun)[] = [];
  if (logo) primeira.push(new ImageRun({ type: "png", data: logo.dados, transformation: { width: logo.largura, height: logo.altura } }), run("   "));
  primeira.push(run(e.razaoSocial, { bold: true, size: SECAO }));
  return new Header({
    children: [
      new Paragraph({ children: primeira, spacing: SEM_ESPACO }),
      new Paragraph({
        children: linha ? [run(linha, { size: PEQUENO, color: "52645A" })] : [],
        spacing: { before: 20, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9D2C5", space: 2 } },
      }),
    ],
  });
}

export function renderRelatorioDocx(r: RelatorioCargas, empresa: EmpresaTimbrado | null = null): Document {
  const children: (Paragraph | Table)[] = [
    paragrafo(r.titulo, { bold: true, size: TITULO, depois: 20 }),
    paragrafo(`${r.subtitulo} · Emissão: ${dataBR(r.emissao)}`, { size: PEQUENO, italics: true, depois: 60 }),
  ];
  for (const s of r.secoes) {
    children.push(paragrafo(`${s.numero}. ${s.titulo}`, { bold: true, size: SECAO, antes: 140, depois: 30, manter: true }));
    for (const b of s.blocos) children.push(...blocoDocx(b));
  }

  return new Document({
    creator: "SenaHub",
    title: r.titulo,
    styles: { default: { document: { run: { font: FONTE, size: CORPO } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } } },
        headers: empresa ? { default: cabecalhoDoTimbrado(empresa) } : undefined,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: SEM_ESPACO,
                children: [run("Página ", { size: PEQUENO }), new TextRun({ children: [PageNumber.CURRENT], font: FONTE, size: PEQUENO }), run(" de ", { size: PEQUENO }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONTE, size: PEQUENO })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}
