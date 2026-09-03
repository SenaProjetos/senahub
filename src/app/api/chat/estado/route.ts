import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { contarNaoLidasTotal, listarCanaisSilenciados } from "@/modules/chat/queries";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";

/**
 * Estado leve do chat para o provider global (badge + som + não perturbe).
 * Não traz canais/usuários — é chamado em toda navegação do dashboard.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // `chat:usar` em vez de `CHAT_ROLES` — ver o comentário em `chat/page.tsx`.
  if (!(await can(session.user, "chat", "usar"))) {
    return NextResponse.json({ error: "Sem acesso ao chat." }, { status: 403 });
  }
  const userId = session.user.id;
  const [total, eu, prefs, silenciados] = await Promise.all([
    contarNaoLidasTotal(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { chatStatus: true } }),
    getPreferencias(userId),
    listarCanaisSilenciados(userId),
  ]);
  return NextResponse.json({
    meId: userId,
    total,
    somChat: prefs.somChat !== false,
    chatStatus: eu?.chatStatus ?? "disponivel",
    silenciados,
  });
}
