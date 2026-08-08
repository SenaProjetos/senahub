import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { lerArquivo } from "@/lib/storage";

/**
 * Serve a miniatura do recorte de um apontamento (item 14) — mesmo gate de acesso ao projeto
 * das rotas irmãs (`/api/pendencias/bcf`, `/api/pendencias/pdf-carimbado`): global, membro do
 * projeto, ou responsável de alguma disciplina dele.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const p = await prisma.pendencia.findUnique({
    where: { id },
    select: { thumbPath: true, projetoId: true, excluidoEm: true },
  });
  if (!p || p.excluidoEm || !p.thumbPath) return NextResponse.json({ error: "Sem miniatura." }, { status: 404 });

  if (!acessoGlobal(user)) {
    const [membro, resp] = await Promise.all([
      prisma.projetoMembro.findFirst({ where: { projetoId: p.projetoId, userId: user.id }, select: { id: true } }),
      prisma.disciplinaResponsavel.findFirst({
        where: { userId: user.id, disciplina: { projetoId: p.projetoId } },
        select: { id: true },
      }),
    ]);
    if (!membro && !resp) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(p.thumbPath);
  } catch {
    // O arquivo pode ter sumido do disco (ver nota da ficha sobre órfãos): 410 em vez de 500.
    return NextResponse.json({ error: "Miniatura indisponível no disco." }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
