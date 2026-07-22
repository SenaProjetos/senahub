import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { can } from "@/lib/permissions";
import { lerArquivo } from "@/lib/storage";

/** Serve o snapshot (PNG) de um apontamento — mesmo gate de acesso do viewer/frag. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "coordenacao", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const apontamento = await prisma.apontamentoCoordenacao.findUnique({
    where: { id },
    select: {
      snapshotPath: true,
      projetoId: true,
      disciplinaId: true,
    },
  });
  if (!apontamento?.snapshotPath) return NextResponse.json({ error: "Sem snapshot." }, { status: 404 });

  const ehGlobal = acessoGlobal(user);
  if (!ehGlobal) {
    // Apontamento de IFC recebido não tem disciplina → acesso só pela membresia do projeto.
    const [ehResp, ehMembro] = await Promise.all([
      apontamento.disciplinaId
        ? prisma.disciplinaResponsavel.findFirst({
            where: { disciplinaId: apontamento.disciplinaId, userId: user.id },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.projetoMembro.findFirst({
        where: { projetoId: apontamento.projetoId, userId: user.id },
        select: { id: true },
      }),
    ]);
    if (!ehResp && !ehMembro) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(apontamento.snapshotPath);
  } catch {
    return NextResponse.json({ error: "Snapshot indisponível no disco." }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
