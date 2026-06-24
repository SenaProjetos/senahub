/**
 * Renderer Excel (.xlsx) da memória — genérico (seções/valores/tabelas).
 * Recebe um Workbook já instanciado (a rota cria via createRequire p/ evitar o problema de
 * default-export do exceljs no Turbopack). Usa apenas `import type` — nada entra no bundle.
 */

import type ExcelJS from "exceljs";
import type { MemoriaDoc } from "./types";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function preencherWorkbookMemoria(wb: ExcelJS.Workbook, doc: MemoriaDoc): void {
  const ws = wb.addWorksheet("Memória");
  ws.columns = [{ width: 42 }, { width: 28 }, { width: 16 }, { width: 12 }];

  const titulo = ws.addRow([doc.titulo]);
  titulo.font = { bold: true, size: 14 };
  if (doc.subtitulo) ws.addRow([doc.subtitulo]).font = { italic: true, color: { argb: "FF555555" } };

  const meta = [
    doc.norma ? `Norma: ${doc.norma}` : "",
    doc.autor ? `Autor: ${doc.autor}` : "",
    doc.projeto ? `Projeto: ${doc.projeto}` : "",
    `Gerado em: ${dataBR(doc.geradoEm)}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  ws.addRow([meta]).font = { size: 9, color: { argb: "FF777777" } };
  ws.addRow([]);

  for (const s of doc.secoes) {
    ws.addRow([s.titulo]).font = { bold: true, size: 12, color: { argb: "FF2C3E50" } };

    for (const p of s.paragrafos ?? []) ws.addRow([p]);

    for (const v of s.valores ?? []) {
      const expr = [v.formula, v.substituicao].filter(Boolean).join(" = ");
      const desc = v.simbolo ? `${v.descricao} (${v.simbolo})` : v.descricao;
      ws.addRow([desc, expr, v.valor, v.unidade ?? ""]);
    }

    for (const t of s.tabelas ?? []) {
      if (t.titulo) ws.addRow([t.titulo]).font = { bold: true };
      ws.addRow(t.colunas).font = { bold: true };
      for (const linha of t.linhas) ws.addRow(linha as (string | number)[]);
    }

    for (const n of s.notas ?? []) ws.addRow([n]).font = { italic: true, size: 9, color: { argb: "FF666666" } };

    ws.addRow([]);
  }

  const disc = ws.addRow([doc.disclaimer]);
  disc.font = { italic: true, size: 8, color: { argb: "FF888888" } };
}
