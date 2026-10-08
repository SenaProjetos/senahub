import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { produtividadeProjetistas, type Granularidade } from "@/modules/rh/produtividade/queries";

/** Item 7: export CSV do relatório de produtividade (formato longo, 1 linha por projetista×período). */
export async function GET(req: Request) {
  await requirePermission("rh", "produtividade"); // inclui o piso de sócio
  const url = new URL(req.url);
  const granularidade: Granularidade = url.searchParams.get("g") === "mes" ? "mes" : "semana";
  const { projetistas } = await produtividadeProjetistas(granularidade);

  const sep = ";";
  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [
    ["projetista", "perfil", "periodo", "horas", "entregas", "tarefas", "atrasos", "producao", "queda"].join(sep),
  ];
  for (const p of projetistas) {
    for (const w of p.periodos) {
      linhas.push(
        [p.nome, p.role, w.periodo, w.horas, w.entregas, w.tarefas, w.atrasos, w.output, w.queda ? "sim" : "nao"]
          .map(esc)
          .join(sep),
      );
    }
  }
  // BOM p/ Excel pt-BR reconhecer UTF-8.
  const csv = "﻿" + linhas.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="produtividade-${granularidade}.csv"`,
    },
  });
}
