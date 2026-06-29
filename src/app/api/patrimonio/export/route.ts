import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/roles";
import { listarAtivos } from "@/modules/patrimonio/queries";
import { STATUS_ATIVO_LABEL } from "@/modules/patrimonio/schemas";

// exceljs é CommonJS — evita problema de default export no Turbopack.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require("exceljs") as typeof import("exceljs");

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const podeVer = await can(session.user.role as Role, "patrimonio", "ver");
  if (!podeVer) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const ativos = await listarAtivos();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventário");
  ws.columns = [
    { header: "Nome", key: "nome", width: 30 },
    { header: "Categoria", key: "categoria", width: 18 },
    { header: "Localização", key: "localizacao", width: 20 },
    { header: "Responsável", key: "responsavel", width: 24 },
    { header: "Aquisição", key: "aquisicao", width: 12 },
    { header: "Valor (R$)", key: "valor", width: 14 },
    { header: "Status", key: "status", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getColumn("valor").numFmt = "#,##0.00";
  for (const a of ativos) {
    ws.addRow({
      nome: a.nome,
      categoria: a.categoria ?? "",
      localizacao: a.localizacao ?? "",
      responsavel: a.responsavel?.name ?? "",
      aquisicao: a.dataAquisicao ? a.dataAquisicao.toISOString().slice(0, 10) : "",
      valor: a.valor != null ? Number(a.valor) : null,
      status: STATUS_ATIVO_LABEL[a.status] ?? a.status,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventario-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
