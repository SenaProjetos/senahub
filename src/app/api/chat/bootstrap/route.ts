import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarCanais, usuariosParaDM } from "@/modules/chat/queries";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";

/** Dados do chat carregados sob demanda (ao abrir o chat flutuante) — não pesa cada navegação. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // `chat:usar` em vez de `CHAT_ROLES` — ver o comentário em `chat/page.tsx`.
  if (!(await can(session.user, "chat", "usar"))) {
    return NextResponse.json({ error: "Sem acesso ao chat." }, { status: 403 });
  }
  const userId = session.user.id;
  const [canais, usuarios, eu, prefs] = await Promise.all([
    listarCanais(userId, session.user.role),
    usuariosParaDM(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { chatStatus: true } }),
    getPreferencias(userId),
  ]);
  return NextResponse.json({
    canais,
    usuarios,
    meId: userId,
    status: eu?.chatStatus ?? "disponivel",
    somChat: prefs.somChat !== false,
    mostrarRecibos: prefs.mostrarRecibos !== false,
  });
}
