import type { Workbook, Worksheet } from "exceljs";

import type { EmpresaTimbrado } from "@/modules/configuracoes/empresa/timbrado";

import { dataBR } from "./formato";
import { linhaDoTimbrado, logoDoTimbrado } from "./timbrado";
import { ABAS_EXCEL, ehNum, type AbaExcel, type BlocoRel, type RelatorioCargas, type SecaoRel, type TabelaRel } from "./tipos";

/**
 * Excel (.xlsx) do relatório de cargas e demanda — uma aba por etapa (Resumo, Levantamento, Demandas, Centros e entradas,
 * Fontes), as mesmas tabelas com números de verdade (formato de célula), impressão em paisagem (spec §7). Puro: recebe o
 * `Workbook` já criado (a rota importa o exceljs).
 */

const CINZA = "FFD9D9D9";
const BORDA = { style: "thin" as const, color: { argb: "FFA6A6A6" } };
const FORMATO = (casas: number) => (casas <= 0 ? "#,##0" : `#,##0.${"0".repeat(casas)}`);

function larguras(ws: Worksheet, maximo: number[]) {
  maximo.forEach((m, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(m + 2, 8), 60);
  });
}

function escreverTabela(ws: Worksheet, t: TabelaRel, linhaInicial: number, maximo: number[]): number {
  let r = linhaInicial;
  if (t.titulo) {
    ws.getCell(r, 1).value = t.titulo;
    ws.getCell(r, 1).font = { bold: true };
    r += 1;
  }
  const cab = ws.getRow(r);
  t.colunas.forEach((c, i) => {
    const cell = cab.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
    cell.alignment = { horizontal: i === 0 && t.primeiraColunaTexto !== false ? "left" : "center", vertical: "middle", wrapText: true };
    cell.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
    maximo[i] = Math.max(maximo[i] ?? 0, Math.min(c.length, 24));
  });
  r += 1;
  t.linhas.forEach((l, ri) => {
    const total = t.ultimaEhTotal === true && ri === t.linhas.length - 1;
    const row = ws.getRow(r);
    l.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (ehNum(c)) {
        cell.value = c.n;
        cell.numFmt = FORMATO(c.c);
        if (c.n == null) cell.value = "—";
        maximo[i] = Math.max(maximo[i] ?? 0, 10);
      } else {
        cell.value = c;
        maximo[i] = Math.max(maximo[i] ?? 0, Math.min(c.length, 60));
      }
      cell.alignment = { horizontal: !ehNum(c) && i === 0 && t.primeiraColunaTexto !== false ? "left" : "center", vertical: "top", wrapText: true };
      cell.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
      if (total) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
      }
    });
    r += 1;
  });
  return r + 1;
}

function escreverBloco(ws: Worksheet, b: BlocoRel, linha: number, maximo: number[]): number {
  switch (b.tipo) {
    case "subtitulo": {
      ws.getCell(linha, 1).value = b.texto;
      ws.getCell(linha, 1).font = { bold: true, size: 11 };
      return linha + 1;
    }
    case "texto": {
      ws.getCell(linha, 1).value = b.texto;
      ws.getCell(linha, 1).font = { bold: b.negrito === true };
      return linha + 1;
    }
    case "lista": {
      let r = linha;
      for (const i of b.itens) {
        ws.getCell(r, 1).value = `• ${i}`;
        r += 1;
      }
      return r + 1;
    }
    case "tabela":
      return escreverTabela(ws, b.tabela, linha, maximo);
  }
}

export function preencherWorkbookRelatorio(wb: Workbook, r: RelatorioCargas, empresa: EmpresaTimbrado | null = null): void {
  wb.creator = "SenaHub";
  const logo = logoDoTimbrado(empresa);
  const logoId = logo ? wb.addImage({ base64: logo.dados.toString("base64"), extension: "png" }) : null;
  const linhaEmpresa = empresa ? linhaDoTimbrado(empresa) : null;
  wb.title = r.titulo;
  const porAba = new Map<AbaExcel, SecaoRel[]>(ABAS_EXCEL.map((a) => [a, []]));
  for (const s of r.secoes) porAba.get(s.aba)!.push(s);

  for (const aba of ABAS_EXCEL) {
    const ws = wb.addWorksheet(aba, { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    const maximo: number[] = [];
    let linha = 1;
    // Timbrado (cabeçalho de cada aba): logo nas três primeiras linhas; razão social, CNPJ e endereço logo abaixo.
    if (empresa) {
      if (logo && logoId != null) {
        for (let i = 1; i <= 3; i++) ws.getRow(i).height = Math.ceil((logo.altura * 0.75) / 3) + 1;
        ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: logo.largura, height: logo.altura } });
        linha = 4;
      }
      ws.getCell(linha, 1).value = empresa.razaoSocial;
      ws.getCell(linha, 1).font = { bold: true, size: 12 };
      linha += 1;
      if (linhaEmpresa) {
        ws.getCell(linha, 1).value = linhaEmpresa;
        ws.getCell(linha, 1).font = { size: 9, color: { argb: "FF52645A" } };
        linha += 1;
      }
      linha += 1;
    }
    ws.getCell(linha, 1).value = r.titulo;
    ws.getCell(linha, 1).font = { bold: true, size: 14 };
    linha += 1;
    ws.getCell(linha, 1).value = `${r.obra} · ${r.nomeEstudo} · Emissão: ${dataBR(r.emissao)}`;
    ws.getCell(linha, 1).font = { italic: true };
    linha += 2;
    for (const s of porAba.get(aba) ?? []) {
      ws.getCell(linha, 1).value = `${s.numero}. ${s.titulo}`;
      ws.getCell(linha, 1).font = { bold: true, size: 12 };
      linha += 1;
      for (const b of s.blocos) linha = escreverBloco(ws, b, linha, maximo);
      linha += 1;
    }
    larguras(ws, maximo);
    ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 8, 28);
  }
}
