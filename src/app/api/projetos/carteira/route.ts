import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";

// exceljs é CommonJS — evita problema de default export no Turbopack.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require("exceljs") as typeof import("exceljs");

function csvRow(cols: (string | number | null | undefined)[]) {
  return cols
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

const SITUACAO_PT: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  arquivado: "Arquivado",
  cancelado: "Cancelado",
};
const TIPO_PT: Record<string, string> = { particular: "Particular", licitacao: "Licitação" };
const CABECALHO = ["Código", "Nome", "Cliente", "Tipo", "Situação", "Prazo de contrato", "Prazo planejado", "Valor Contrato (R$)", "Disciplinas Total", "Aprovadas", "Criado em"];

export async function GET(request: Request) {
  // `getSession` (lib/session) traz o sujeito completo que `can()` agora exige — a sessão crua
  // do better-auth não tem `superUsuario`/`perfilId`.
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const user = session.user;
  const podeVer = await can(user, "projetos", "ver");
  if (!podeVer) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  // XLSX é o padrão (Mód 2); CSV permanece como opção.
  const formato = new URL(request.url).searchParams.get("formato") === "csv" ? "csv" : "xlsx";

  const projetos = await prisma.projeto.findMany({
    where: { AND: [escopoProjeto(user)] },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      codigo: true,
      nome: true,
      situacao: true,
      tipo: true,
      prazoContrato: true,
      prazoPlanejado: true,
      valorContrato: true,
      createdAt: true,
      cliente: { select: { nome: true } },
      disciplinas: { select: { status: true } },
    },
  });

  const linhas = projetos.map((p) => ({
    codigo: p.codigo,
    nome: p.nome,
    cliente: p.cliente.nome,
    tipo: TIPO_PT[p.tipo] ?? p.tipo,
    situacao: SITUACAO_PT[p.situacao] ?? p.situacao,
    prazoContrato: p.prazoContrato ? p.prazoContrato.toISOString().slice(0, 10) : "",
    prazoPlanejado: p.prazoPlanejado ? p.prazoPlanejado.toISOString().slice(0, 10) : "",
    valor: p.valorContrato != null ? Number(p.valorContrato) : null,
    total: p.disciplinas.length,
    aprovadas: p.disciplinas.filter((d) => d.status === "aprovado").length,
    criado: p.createdAt.toISOString().slice(0, 10),
  }));

  const hoje = new Date().toISOString().slice(0, 10);

  if (formato === "csv") {
    const out: string[] = [csvRow(CABECALHO)];
    for (const l of linhas) {
      out.push(csvRow([l.codigo, l.nome, l.cliente, l.tipo, l.situacao, l.prazoContrato, l.prazoPlanejado, l.valor != null ? l.valor.toFixed(2) : "", l.total, l.aprovadas, l.criado]));
    }
    const csv = "﻿" + out.join("\r\n"); // BOM para Excel pt-BR
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="carteira-projetos-${hoje}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Carteira");
  ws.columns = [
    { header: "Código", key: "codigo", width: 12 },
    { header: "Nome", key: "nome", width: 36 },
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Situação", key: "situacao", width: 14 },
    { header: "Prazo de contrato", key: "prazoContrato", width: 16 },
    { header: "Prazo planejado", key: "prazoPlanejado", width: 16 },
    { header: "Valor Contrato (R$)", key: "valor", width: 18 },
    { header: "Disciplinas Total", key: "total", width: 16 },
    { header: "Aprovadas", key: "aprovadas", width: 11 },
    { header: "Criado em", key: "criado", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getColumn("valor").numFmt = "#,##0.00";
  for (const l of linhas) ws.addRow(l);

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="carteira-projetos-${hoje}.xlsx"`,
    },
  });
}
