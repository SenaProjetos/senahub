import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { logAudit, getClientIp } from "@/lib/audit";
import { exportarPendenciasBcf } from "@/modules/projetos/pendencias/bcf";

/**
 * Exporta apontamentos (Pendencia) de uma prancha como `.bcfzip` (BCF 2.1) — item 36.
 * GET com `projeto` + `ids` (csv) na query, mesmo formato do `/api/coordenacao/bcf`.
 * Gate: acesso ao projeto (global, membro, ou responsável de alguma disciplina dele) — mesma
 * regra da rota irmã de Coordenação, já que Pendencia não tem permissão fina própria de leitura.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const url = new URL(req.url);
  const projetoId = url.searchParams.get("projeto") ?? "";
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!projetoId || ids.length === 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

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

  const resultado = await exportarPendenciasBcf(projetoId, ids);
  if ("erro" in resultado) return NextResponse.json({ error: resultado.erro }, { status: 404 });

  await logAudit({
    userId: user.id,
    modulo: "projetos",
    acao: "exportar-bcf-pendencias",
    resultado: "sucesso",
    entidade: "Pendencia",
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
