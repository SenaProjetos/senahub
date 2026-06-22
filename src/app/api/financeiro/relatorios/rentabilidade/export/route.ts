import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

type Linha = {
  codigo: string;
  projeto: string;
  cliente: string;
  receita: number;
  diretos: number;
  indireto: number;
  lucroLiquido: number;
  margemLiquida: number | null;
  roi: number | null;
};

const COLUNAS = [
  { header: "Código", key: "codigo", width: 12 },
  { header: "Projeto", key: "projeto", width: 36 },
  { header: "Cliente", key: "cliente", width: 28 },
  { header: "Receita", key: "receita", width: 16 },
  { header: "Custos diretos", key: "diretos", width: 16 },
  { header: "Indireto rateado", key: "indireto", width: 16 },
  { header: "Lucro líquido", key: "lucroLiquido", width: 16 },
  { header: "Margem líq. %", key: "margemLiquida", width: 14 },
  { header: "ROI %", key: "roi", width: 12 },
];

function csv(linhas: Linha[]): string {
  const esc = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = COLUNAS.map((c) => c.header).join(";");
  const body = linhas
    .map((l) => COLUNAS.map((c) => esc((l as unknown as Record<string, string | number | null>)[c.key])).join(";"))
    .join("\n");
  return "﻿" + head + "\n" + body; // BOM p/ Excel reconhecer UTF-8
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "financeiro", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const body = (await req.json()) as { formato?: string; titulo?: string; linhas?: Linha[] };
  const formato = body.formato === "csv" ? "csv" : "xlsx";
  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  const titulo = body.titulo || "Rentabilidade";
  const arquivo = `${titulo.replace(/[^a-zA-Z0-9-]+/g, "_")}.${formato}`;

  if (formato === "csv") {
    return new NextResponse(csv(linhas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${arquivo}"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(titulo.slice(0, 28));
  ws.columns = COLUNAS;
  ws.getRow(1).font = { bold: true };
  for (const l of linhas) ws.addRow(l);
  for (const key of ["receita", "diretos", "indireto", "lucroLiquido"]) {
    ws.getColumn(key).numFmt = '#,##0.00;[Red]-#,##0.00';
  }
  const totais = linhas.reduce(
    (s, l) => ({
      receita: s.receita + (Number(l.receita) || 0),
      diretos: s.diretos + (Number(l.diretos) || 0),
      indireto: s.indireto + (Number(l.indireto) || 0),
      lucroLiquido: s.lucroLiquido + (Number(l.lucroLiquido) || 0),
    }),
    { receita: 0, diretos: 0, indireto: 0, lucroLiquido: 0 },
  );
  const totalRow = ws.addRow({ projeto: "TOTAL", ...totais });
  totalRow.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
