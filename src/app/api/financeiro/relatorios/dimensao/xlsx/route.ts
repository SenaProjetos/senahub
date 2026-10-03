import { NextResponse } from "next/server";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { createRequire } from "node:module";
import { requirePermission } from "@/lib/session";
import { relatorioPorDimensao, type DimensaoRelatorio } from "@/modules/financeiro/relatorios/queries";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

const DIMENSOES: DimensaoRelatorio[] = ["categoria", "centro", "contato", "projeto", "tag"];
const ROTULO: Record<DimensaoRelatorio, string> = { categoria: "Categoria", centro: "Centro de custo", contato: "Contato", projeto: "Projeto", tag: "Tag" };

export async function GET(req: Request) {
  // Mesmo gate da tela (N6): resultado é `resultados`, não `ver`.
  await requirePermission("financeiro", "resultados");
  const url = new URL(req.url);
  const hoje = new Date();
  const dimensao = DIMENSOES.includes(url.searchParams.get("dimensao") as DimensaoRelatorio)
    ? (url.searchParams.get("dimensao") as DimensaoRelatorio)
    : "categoria";
  const de = url.searchParams.get("de") ? new Date(url.searchParams.get("de")!) : utcInicioDoDia(hoje.getFullYear(), hoje.getMonth());
  const ate = url.searchParams.get("ate") ? new Date(url.searchParams.get("ate")!) : utcFimDoDia(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  const relatorio = await relatorioPorDimensao(dimensao, de, ate);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Relatório");
  ws.columns = [
    { header: ROTULO[dimensao], key: "nome", width: 36 },
    { header: "Receita", key: "receita", width: 16 },
    { header: "Despesa", key: "despesa", width: 16 },
    { header: "Resultado", key: "resultado", width: 16 },
    { header: "Lançamentos", key: "qtd", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const l of relatorio.linhas) ws.addRow({ nome: l.nome, receita: l.receita, despesa: l.despesa, resultado: l.resultado, qtd: l.qtd });
  const totalReceita = relatorio.linhas.reduce((s, l) => s + l.receita, 0);
  const totalDespesa = relatorio.linhas.reduce((s, l) => s + l.despesa, 0);
  ws.addRow({});
  ws.addRow({ nome: "Total", receita: totalReceita, despesa: totalDespesa, resultado: totalReceita - totalDespesa }).font = { bold: true };
  for (const col of ["receita", "despesa", "resultado"]) ws.getColumn(col).numFmt = '"R$" #,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Relatorio_${dimensao}_${relatorio.de}_${relatorio.ate}.xlsx"`,
    },
  });
}
