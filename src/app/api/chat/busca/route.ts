import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { buscarMensagens } from "@/modules/chat/busca";

/** Busca de mensagens nos canais do usuário (C4-4). Leitura dinâmica disparada pelo cliente. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // `chat:usar` em vez de `CHAT_ROLES` — ver o comentário em `chat/page.tsx`.
  if (!(await can(session.user, "chat", "usar"))) {
    return NextResponse.json({ error: "Sem acesso ao chat." }, { status: 403 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const resultados = await buscarMensagens(session.user.id, q);
  return NextResponse.json({ resultados });
}
