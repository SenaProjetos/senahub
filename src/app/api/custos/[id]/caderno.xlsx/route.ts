import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { dadosCaderno } from "@/modules/custos/quantitativos/queries";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const ORIGEM_LABEL: Record<string, string> = { manual: "Manual", ifc: "IFC", dwg: "DXF", pdf: "PDF", ia: "IA" };

/** Caderno de quantitativos em XLSX. Mesmo módulo puro que alimenta o PDF (`/print`). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "custos", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const dados = await dadosCaderno(id);
  if (!dados) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Caderno de quantitativos");

  const cab = dados.cabecalho;
  ws.addRow([cab.titulo]).font = { bold: true, size: 14 };
  ws.addRow([`Obra: ${cab.obra}`]);
  ws.addRow([`Contratante: ${cab.contratante}`]);
  ws.addRow([`Data-base: ${cab.dataBase.toLocaleDateString("pt-BR")}`]);
  ws.addRow([]);

  for (const grupo of dados.grupos) {
    const linhaItem = ws.addRow([
      grupo.itemCodigo ?? "—",
      grupo.itemDescricao,
      grupo.itemUnidade ?? "",
      grupo.itemQuantidade,
      grupo.somaQuantitativos,
      grupo.divergencia,
    ]);
    linhaItem.font = { bold: true };
    if (grupo.divergencia !== null && Math.abs(grupo.divergencia) > 0.01) {
      linhaItem.getCell(6).font = { bold: true, color: { argb: "FFB91C1C" } };
    }

    const linhaCabecalho = ws.addRow(["", "Levantamento", "Origem", "Quantidade", "Rastro", "Autor", "Data", "Memória"]);
    linhaCabecalho.font = { italic: true, size: 10 };

    for (const l of grupo.linhas) {
      ws.addRow([
        "",
        l.descricao,
        ORIGEM_LABEL[l.origem] ?? l.origem,
        `${l.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${l.unidade}`,
        l.rastro,
        l.criadoPorNome,
        l.createdAt.toLocaleString("pt-BR"),
        l.memoria ?? "",
      ]);
    }
    ws.addRow([]);
  }

  ws.columns = [
    { width: 12 },
    { width: 42 },
    { width: 10 },
    { width: 18 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 50 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="caderno-quantitativos-${id}.xlsx"`,
    },
  });
}
