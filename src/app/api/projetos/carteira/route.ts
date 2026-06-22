import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";
import type { Role } from "@/lib/roles";

function csvRow(cols: (string | number | null | undefined)[]) {
  return cols
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const user = { id: session.user.id, role: session.user.role as Role };
  const podeVer = await can(user.role, "projetos", "ver");
  if (!podeVer) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const projetos = await prisma.projeto.findMany({
    where: { AND: [escopoProjeto(user)] },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      codigo: true,
      nome: true,
      situacao: true,
      tipo: true,
      prazoFinal: true,
      valorContrato: true,
      createdAt: true,
      cliente: { select: { nome: true } },
      disciplinas: { select: { status: true } },
    },
  });

  const SITUACAO_PT: Record<string, string> = {
    em_andamento: "Em andamento",
    concluido: "Concluído",
    arquivado: "Arquivado",
    cancelado: "Cancelado",
  };

  const TIPO_PT: Record<string, string> = { particular: "Particular", licitacao: "Licitação" };

  const linhas: string[] = [
    csvRow(["Código", "Nome", "Cliente", "Tipo", "Situação", "Prazo", "Valor Contrato (R$)", "Disciplinas Total", "Aprovadas", "Criado em"]),
  ];

  for (const p of projetos) {
    const total = p.disciplinas.length;
    const aprovadas = p.disciplinas.filter((d) => d.status === "aprovado").length;
    linhas.push(
      csvRow([
        p.codigo,
        p.nome,
        p.cliente.nome,
        TIPO_PT[p.tipo] ?? p.tipo,
        SITUACAO_PT[p.situacao] ?? p.situacao,
        p.prazoFinal ? p.prazoFinal.toISOString().slice(0, 10) : "",
        p.valorContrato != null ? Number(p.valorContrato).toFixed(2) : "",
        total,
        aprovadas,
        p.createdAt.toISOString().slice(0, 10),
      ]),
    );
  }

  const csv = "﻿" + linhas.join("\r\n"); // BOM para Excel pt-BR
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carteira-projetos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
