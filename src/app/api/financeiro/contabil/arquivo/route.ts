import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CABECALHO_ARQUIVO, csvDoArquivo, linhasDoArquivo } from "@/modules/financeiro/contabil/arquivo";
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

/**
 * Baixa uma exportação contábil JÁ REGISTRADA (`exportarMesContabil` grava e audita; aqui só se lê o registro,
 * para o arquivo ser exatamente o que ficou guardado). Mesmo gate da tela: `financeiro:fechar`.
 */
export async function GET(req: Request) {
  await requirePermission("financeiro", "fechar");
  const id = new URL(req.url).searchParams.get("id");
  const e = id ? await prisma.exportacaoContabil.findUnique({ where: { id } }) : null;
  if (!e) return NextResponse.json({ error: "Exportação não encontrada." }, { status: 404 });
  const linhas = e.linhas as unknown as LinhaContabil[];
  const nome = `Contabil_${e.competencia}`;

  if (e.formato === "csv") {
    return new NextResponse(csvDoArquivo(linhas), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}.csv"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lançamentos");
  ws.addRow([...CABECALHO_ARQUIVO]).font = { bold: true };
  for (const l of linhasDoArquivo(linhas)) ws.addRow(l);
  [12, 10, 10, 14, 56, 18, 46, 14, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(4).numFmt = "#,##0.00";
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}.xlsx"`,
    },
  });
}
