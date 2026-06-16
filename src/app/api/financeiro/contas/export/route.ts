import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

type Linha = {
  vencimento: string;
  descricao: string;
  categoria: string;
  contato: string;
  conta: string;
  centro: string;
  situacao: string;
  valor: number;
};

const COLUNAS = [
  { header: "Vencimento", key: "vencimento", width: 14 },
  { header: "Descrição", key: "descricao", width: 40 },
  { header: "Categoria", key: "categoria", width: 28 },
  { header: "Contato", key: "contato", width: 28 },
  { header: "Conta", key: "conta", width: 18 },
  { header: "Centro", key: "centro", width: 18 },
  { header: "Situação", key: "situacao", width: 14 },
  { header: "Valor", key: "valor", width: 16 },
];

function csv(linhas: Linha[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = COLUNAS.map((c) => c.header).join(";");
  const body = linhas
    .map((l) => COLUNAS.map((c) => esc((l as unknown as Record<string, string | number>)[c.key])).join(";"))
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
  const titulo = body.titulo || "Contas";
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
  ws.getColumn("valor").numFmt = '#,##0.00;[Red]-#,##0.00';
  const total = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const totalRow = ws.addRow({ situacao: "TOTAL", valor: total });
  totalRow.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
