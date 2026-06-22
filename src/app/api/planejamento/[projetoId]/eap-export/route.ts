import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import type ExcelJSType from "exceljs";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { eapDoProjeto, projetoVisivel } from "@/modules/planejamento/queries";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

/** Computa código WBS (ex: "1.2.3") a partir da lista plana com parentId. */
function wbsCodes(tarefas: { id: string; parentId: string | null; ordem: number }[]): Map<string, string> {
  const byParent = new Map<string | null, typeof tarefas>();
  for (const t of tarefas) {
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  const codes = new Map<string, string>();
  function walk(parentId: string | null, prefix: string) {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.ordem - b.ordem);
    children.forEach((c, i) => {
      const code = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      codes.set(c.id, code);
      walk(c.id, code);
    });
  }
  walk(null, "");
  return codes;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projetoId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "planejamento", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { projetoId } = await params;
  const projeto = await projetoVisivel(session.user, projetoId);
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  const { tarefas, temLinhaBase } = await eapDoProjeto(projetoId);
  const wbs = wbsCodes(tarefas);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SenaHub";
  wb.created = new Date();

  const ws = wb.addWorksheet("EAP");

  const COLUNAS: Partial<ExcelJSType.Column>[] = [
    { header: "WBS", key: "wbs", width: 10 },
    { header: "Tarefa", key: "nome", width: 42 },
    { header: "Disciplina", key: "disciplina", width: 28 },
    { header: "Início previsto", key: "inicio", width: 16 },
    { header: "Fim previsto", key: "fim", width: 16 },
    { header: "Progresso (%)", key: "progresso", width: 14 },
    ...(temLinhaBase
      ? [
          { header: "Início baseline", key: "inicioBase", width: 16 },
          { header: "Fim baseline", key: "fimBase", width: 16 },
          { header: "Desvio (dias)", key: "desvio", width: 14 },
        ]
      : []),
  ];

  ws.columns = COLUNAS;

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C2D58" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  const sorted = [...tarefas].sort((a, b) => {
    const wa = wbs.get(a.id) ?? "";
    const wb_ = wbs.get(b.id) ?? "";
    return wa.localeCompare(wb_, undefined, { numeric: true });
  });

  for (const t of sorted) {
    const code = wbs.get(t.id) ?? "";
    const depth = code.split(".").length - 1;
    const desvio = temLinhaBase && t.fimBaseline
      ? Math.round((new Date(t.fimPrevisto + "T00:00:00").getTime() - new Date(t.fimBaseline + "T00:00:00").getTime()) / 86400000)
      : undefined;

    const row = ws.addRow({
      wbs: code,
      nome: "  ".repeat(depth) + t.nome,
      disciplina: t.disciplinaNome ?? "",
      inicio: t.inicioPrevisto,
      fim: t.fimPrevisto,
      progresso: t.progresso,
      ...(temLinhaBase ? { inicioBase: t.inicioBaseline ?? "", fimBase: t.fimBaseline ?? "", desvio: desvio ?? "" } : {}),
    });

    if (depth === 0) row.font = { bold: true };
    if (desvio != null && desvio > 0) {
      const cell = row.getCell("desvio");
      cell.font = { color: { argb: "FFCC0000" } };
    }
  }

  ws.getColumn("progresso").numFmt = '0"%"';

  const buffer = await wb.xlsx.writeBuffer();
  const slug = projeto.codigo.replace(/[^a-zA-Z0-9-]/g, "_");
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="EAP_${slug}.xlsx"`,
    },
  });
}
