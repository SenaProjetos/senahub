import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { mensagensCanal } from "@/modules/chat/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ canalId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { canalId } = await ctx.params;

  const msgs = await mensagensCanal(canalId, session.user.id);
  if (msgs === null) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  return NextResponse.json({
    mensagens: msgs.map((m) => ({
      id: m.id,
      conteudo: m.conteudo,
      fixada: m.fixada,
      anexoMime: m.anexoMime,
      anexoNome: m.anexoNome,
      autor: { id: m.autor.id, name: m.autor.name },
      createdAt: m.createdAt,
    })),
  });
}
