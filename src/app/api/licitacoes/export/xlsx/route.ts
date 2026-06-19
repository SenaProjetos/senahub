import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { licitacoesParaExport } from "@/modules/licitacoes/queries";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  ganha: "Ganha",
  perdida: "Perdida",
  em_execucao: "Em execução",
  concluida: "Concluída",
};

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "licitacoes", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const filtro = {
    status: sp.get("status") ? sp.get("status")!.split(",").filter(Boolean) : [],
    orgao: sp.get("orgao") ?? "",
    q: sp.get("q") ?? "",
  };
  const linhas = await licitacoesParaExport(filtro);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Licitações");
  ws.columns = [
    { header: "Título", key: "titulo", width: 40 },
    { header: "Órgão", key: "orgao", width: 28 },
    { header: "Modalidade", key: "modalidade", width: 18 },
    { header: "Nº Edital", key: "numeroEdital", width: 16 },
    { header: "Status", key: "status", width: 16 },
    { header: "Valor estimado", key: "valorEstimado", width: 18 },
    { header: "Prazo", key: "prazoProposta", width: 14 },
    { header: "Projeto", key: "projetoCodigo", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const l of linhas) ws.addRow({ ...l, status: STATUS_LABEL[l.status] ?? l.status });
  ws.getColumn("valorEstimado").numFmt = '#,##0.00;[Red]-#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="licitacoes.xlsx"`,
    },
  });
}
