import { type NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import { memoriaDoCalculo } from "@/modules/ferramentas/queries";
import { preencherWorkbookMemoria } from "@/modules/ferramentas/memoria/render-xlsx";
import { slugCalculo } from "@/modules/ferramentas/export-util";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

/** Memória de cálculo em Excel (.xlsx). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await memoriaDoCalculo(id);
    if (!res) return new Response("Cálculo não encontrado.", { status: 404 });

    const wb = new ExcelJS.Workbook();
    preencherWorkbookMemoria(wb, res.doc);
    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${slugCalculo(res.calc.titulo)}.xlsx"`,
      },
    });
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }
}
