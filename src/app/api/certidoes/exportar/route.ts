import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { statusCertidao } from "@/modules/certidoes/service";

// exceljs é CommonJS — evita problema de default export no Turbopack.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require("exceljs") as typeof import("exceljs");

const STATUS_LABEL: Record<string, string> = { vencida: "Vencida", vence_em_breve: "Vence em breve", ok: "Ok" };

/** Exporta o panorama de certidões (tipo/descrição/validade/status/responsável/versões) em .xlsx. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (session.user.mustChangePassword || !session.user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(session.user, "certidoes", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const certidoes = await prisma.certidao.findMany({
    orderBy: { validade: "asc" },
    include: { tipo: true, responsavel: { select: { name: true } }, _count: { select: { versoes: true } } },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Certidões");
  ws.columns = [
    { header: "Tipo", key: "tipo", width: 30 },
    { header: "Descrição", key: "descricao", width: 30 },
    { header: "Validade", key: "validade", width: 14 },
    { header: "Status", key: "status", width: 16 },
    { header: "Responsável", key: "responsavel", width: 22 },
    { header: "Arquivo anexado", key: "arquivo", width: 16 },
    { header: "Versões", key: "versoes", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of certidoes) {
    const validadeISO = c.validade.toISOString().slice(0, 10);
    ws.addRow({
      tipo: c.tipo.nome,
      descricao: c.descricao ?? "",
      validade: validadeISO,
      status: STATUS_LABEL[statusCertidao(validadeISO)],
      responsavel: c.responsavel?.name ?? "",
      arquivo: c.arquivoPath ? "Sim" : "Não",
      versoes: c._count.versoes,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="certidoes-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
