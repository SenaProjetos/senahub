import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { requirePermission } from "@/lib/session";
import { relatorioDRE } from "@/modules/financeiro/relatorios/queries";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

export async function GET(req: Request) {
  await requirePermission("financeiro", "ver");
  const url = new URL(req.url);
  const hoje = new Date();
  const de = url.searchParams.get("de")
    ? new Date(url.searchParams.get("de")!)
    : new Date(hoje.getFullYear(), 0, 1);
  const ate = url.searchParams.get("ate")
    ? new Date(url.searchParams.get("ate")!)
    : new Date(hoje.getFullYear(), 11, 31);

  const dre = await relatorioDRE(de, ate);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DRE");
  ws.columns = [
    { header: "Código", key: "codigo", width: 12 },
    { header: "Conta", key: "nome", width: 36 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Valor", key: "valor", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };

  ws.addRow({ nome: "RECEITAS", tipo: "", valor: "" }).font = { bold: true };
  for (const l of dre.receitas) ws.addRow(l);
  ws.addRow({ nome: "Total receitas", valor: dre.totalReceitas }).font = { bold: true };

  ws.addRow({});
  ws.addRow({ nome: "DESPESAS", tipo: "", valor: "" }).font = { bold: true };
  for (const l of dre.despesas) ws.addRow(l);
  ws.addRow({ nome: "Total despesas", valor: dre.totalDespesas }).font = { bold: true };

  ws.addRow({});
  ws.addRow({ nome: "RESULTADO", valor: dre.resultado }).font = { bold: true };

  ws.getColumn("valor").numFmt = '"R$" #,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DRE_${dre.de}_${dre.ate}.xlsx"`,
    },
  });
}
