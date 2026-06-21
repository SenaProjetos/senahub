import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buscarMensagens } from "@/modules/chat/busca";
import { CHAT_ROLES } from "@/modules/chat/roles";

/** Busca de mensagens nos canais do usuário (C4-4). Leitura dinâmica disparada pelo cliente. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(CHAT_ROLES as readonly string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Sem acesso ao chat." }, { status: 403 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const resultados = await buscarMensagens(session.user.id, q);
  return NextResponse.json({ resultados });
}
