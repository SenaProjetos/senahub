import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { lerArquivo } from "@/lib/storage";
import { MENSAGEM_ACESSO_MODELO as MSG, veModelosDoProjeto } from "@/modules/coordenacao/acesso";

/** Serve o snapshot (PNG) de um apontamento — mesmo gate do viewer/frag (`veModelosDoProjeto`). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: MSG.semSessao }, { status: 401 });
  const user = session.user;
  if (!(await can(user, "coordenacao", "ver"))) {
    return NextResponse.json({ error: MSG.semPermissao }, { status: 403 });
  }
  const { id } = await ctx.params;

  const apontamento = await prisma.apontamentoCoordenacao.findUnique({
    where: { id },
    select: { snapshotPath: true, projetoId: true },
  });
  if (!apontamento?.snapshotPath) return NextResponse.json({ error: MSG.semSnapshot }, { status: 404 });

  if (!(await veModelosDoProjeto(user, apontamento.projetoId))) {
    return NextResponse.json({ error: MSG.foraDoProjeto }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(apontamento.snapshotPath);
  } catch {
    return NextResponse.json({ error: MSG.snapshotSumiu }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
