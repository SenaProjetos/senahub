import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { acessoGlobal } from "@/lib/roles";
import { logAudit, getClientIp } from "@/lib/audit";
import { exportarBcf } from "@/modules/coordenacao/bcf/exportar";

/**
 * Exporta apontamentos de coordenação como `.bcfzip` (BCF 2.1) para abrir no
 * Revit/Navisworks/BIMcollab. GET com `projeto` + `ids` (csv) na query.
 * Gate: coordenacao:ver + acesso ao projeto (global ou membro).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "coordenacao", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const url = new URL(req.url);
  const projetoId = url.searchParams.get("projeto") ?? "";
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!projetoId || ids.length === 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  // Acesso ao projeto: global OU membro OU responsável de alguma disciplina dele.
  if (!acessoGlobal(user)) {
    const [membro, resp] = await Promise.all([
      prisma.projetoMembro.findFirst({ where: { projetoId, userId: user.id }, select: { id: true } }),
      prisma.disciplinaResponsavel.findFirst({
        where: { userId: user.id, disciplina: { projetoId } },
        select: { id: true },
      }),
    ]);
    if (!membro && !resp) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const resultado = await exportarBcf(projetoId, ids);
  if ("erro" in resultado) return NextResponse.json({ error: resultado.erro }, { status: 404 });

  await logAudit({
    userId: user.id,
    modulo: "coordenacao",
    acao: "exportar-bcf",
    resultado: "sucesso",
    entidade: "ApontamentoCoordenacao",
    entidadeId: projetoId,
    detalhe: { total: resultado.total },
    ip: await getClientIp(),
  });

  return new NextResponse(resultado.stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="apontamentos-${projetoId}.bcfzip"`,
    },
  });
}
