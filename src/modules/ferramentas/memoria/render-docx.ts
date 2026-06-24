/**
 * Renderer Word (.docx) da memória de cálculo, a partir do MemoriaDoc.
 * Usa a lib `docx` (JS puro). Sem Next/HTTP.
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from "docx";
import type { MemoriaDoc, MemoriaSecao, MemoriaTabela, MemoriaValor } from "./types";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function valorParagrafo(v: MemoriaValor): Paragraph {
  const runs: TextRun[] = [];
  runs.push(new TextRun({ text: v.descricao }));
  if (v.simbolo) runs.push(new TextRun({ text: ` (${v.simbolo})`, italics: true }));
  const expr = [v.formula, v.substituicao].filter(Boolean).join(" = ");
  if (expr) runs.push(new TextRun({ text: ` = ${expr}`, color: "666666" }));
  runs.push(new TextRun({ text: ` = ${v.valor}`, bold: true }));
  if (v.unidade) runs.push(new TextRun({ text: ` ${v.unidade}` }));
  return new Paragraph({ children: runs, spacing: { after: 60 } });
}

function tabelaDocx(t: MemoriaTabela): Table {
  const header = new TableRow({
    tableHeader: true,
    children: t.colunas.map(
      (c) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })],
        }),
    ),
  });
  const linhas = t.linhas.map(
    (l) =>
      new TableRow({
        children: l.map(
          (c) => new TableCell({ children: [new Paragraph(String(c))] }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...linhas],
  });
}

function secaoChildren(s: MemoriaSecao): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ text: s.titulo, heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }),
  ];
  for (const p of s.paragrafos ?? []) out.push(new Paragraph({ text: p, spacing: { after: 60 } }));
  for (const v of s.valores ?? []) out.push(valorParagrafo(v));
  for (const t of s.tabelas ?? []) {
    if (t.titulo) out.push(new Paragraph({ children: [new TextRun({ text: t.titulo, bold: true })], spacing: { before: 80, after: 40 } }));
    out.push(tabelaDocx(t));
  }
  for (const n of s.notas ?? [])
    out.push(new Paragraph({ children: [new TextRun({ text: n, italics: true, size: 18 })], spacing: { before: 40 } }));
  return out;
}

export function renderMemoriaDocx(doc: MemoriaDoc): Document {
  const meta = [
    doc.norma ? `Norma: ${doc.norma}` : "",
    doc.autor ? `Autor: ${doc.autor}` : "",
    doc.projeto ? `Projeto: ${doc.projeto}` : "",
    `Gerado em: ${dataBR(doc.geradoEm)}`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: doc.titulo, heading: HeadingLevel.TITLE }),
  ];
  if (doc.subtitulo) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitulo, italics: true })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: meta, size: 18, color: "777777" })], spacing: { after: 120 } }));

  for (const s of doc.secoes) children.push(...secaoChildren(s));

  // Disclaimer (rodapé): parágrafo com borda superior.
  children.push(
    new Paragraph({
      spacing: { before: 240 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "DDDDDD", space: 6 } },
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: doc.disclaimer, italics: true, size: 16, color: "888888" })],
    }),
  );

  return new Document({ sections: [{ children }] });
}
