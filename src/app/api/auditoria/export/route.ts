import { NextResponse } from "next/server";
import { format } from "date-fns";
import { getSession } from "@/lib/session";
import { auditoriaParaExport } from "@/modules/auditoria/queries";
import { ACAO_LABEL } from "@/modules/auditoria/labels";

const COLUNAS = [
  "Data/hora",
  "Usuário",
  "Módulo",
  "Ação",
  "Resultado",
  "Entidade",
  "IP",
] as const;

/** Escapa um valor para uma célula CSV (RFC 4180). */
function csvCell(value: string | null | undefined): string {
  const s = (value ?? "").replace(/\r?\n/g, " ");
  if (/[",;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  // A página de auditoria é restrita a admin (requireRole("admin")).
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const rows = await auditoriaParaExport({
    modulo: sp.get("modulo") ?? undefined,
    resultado: sp.get("resultado") ?? undefined,
    q: sp.get("q") ?? undefined,
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
  });

  const linhas = [COLUNAS.join(";")];
  for (const r of rows) {
    linhas.push(
      [
        format(new Date(r.createdAt), "dd/MM/yyyy HH:mm:ss"),
        r.user?.name ?? r.user?.email ?? "—",
        r.modulo,
        ACAO_LABEL[r.acao] ?? r.acao,
        r.resultado,
        r.entidade ?? "",
        r.ip ?? "",
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  // BOM para o Excel reconhecer UTF-8 corretamente.
  const csv = "﻿" + linhas.join("\r\n");
  const nome = `auditoria-${format(new Date(), "yyyy-MM-dd")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
