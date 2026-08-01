import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { dadosPlanilha } from "@/modules/custos/orcamento/queries";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const MOEDA = '#,##0.00;[Red]-#,##0.00';

/** Planilha orçamentária (sintética ou analítica) em XLSX. Mesmo módulo puro que alimenta o PDF. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "custos", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") === "analitica" ? "analitica" : "sintetica";
  const dados = await dadosPlanilha(id, tipo);
  if (!dados) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(tipo === "analitica" ? "Analítica" : "Sintética");

  // Cabeçalho da obra (exigência do briefing: obra + data-base em todo relatório).
  const cab = dados.cabecalho;
  ws.addRow([cab.titulo]).font = { bold: true, size: 14 };
  ws.addRow([`Obra: ${cab.obra}`]);
  ws.addRow([`Contratante: ${cab.contratante}`]);
  ws.addRow([`Data-base: ${cab.dataBase.toLocaleDateString("pt-BR")}`]);
  ws.addRow([`Base de preço: ${cab.basePrecoNome ?? "—"}`]);
  ws.addRow([`BDI: ${cab.bdiPercentual.toFixed(2)}%`]);
  ws.addRow([]);

  const linhaCabecalho = ws.addRow([
    "Item",
    "Código",
    "Banco",
    "Descrição",
    "Und",
    "Quant.",
    "Valor Unit",
    "Valor com BDI",
    "Total",
  ]);
  linhaCabecalho.font = { bold: true };

  for (const l of dados.linhas) {
    const row = ws.addRow([
      l.codigo,
      l.codigoBanco,
      l.bancoNome,
      `${"    ".repeat(l.nivel)}${l.descricao}`,
      l.unidade,
      l.quantidade,
      l.custoUnitario,
      l.custoUnitarioComBdi,
      l.totalComBdi,
    ]);
    if (l.tipo === "grupo") row.font = { bold: true };
    if (l.tipo === "composicao_item") row.font = { italic: true, size: 10 };
  }

  ws.addRow([]);
  ws.addRow(["", "", "", "TOTAL SEM BDI", "", "", "", "", dados.totalSemBdi]).font = { bold: true };
  ws.addRow(["", "", "", "TOTAL COM BDI", "", "", "", "", dados.totalComBdi]).font = { bold: true };

  if (dados.resumoGrupos.length > 0) {
    ws.addRow([]);
    ws.addRow(["Participação por grupo"]).font = { bold: true };
    ws.addRow(["Item", "Grupo", "Total c/ BDI", "Participação %"]).font = { bold: true };
    for (const g of dados.resumoGrupos) {
      ws.addRow([g.codigo, g.descricao, g.totalComBdi, g.participacaoPct]);
    }
  }

  ws.columns = [
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 50 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];
  for (const col of ["F", "G", "H", "I"]) ws.getColumn(col).numFmt = MOEDA;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="planilha-${tipo}-${id}.xlsx"`,
    },
  });
}
