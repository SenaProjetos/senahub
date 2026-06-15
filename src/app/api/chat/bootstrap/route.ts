import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarCanais, usuariosParaDM } from "@/modules/chat/queries";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";

const CHAT_ROLES = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"];

/** Dados do chat carregados sob demanda (ao abrir o chat flutuante) — não pesa cada navegação. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!CHAT_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem acesso ao chat." }, { status: 403 });
  }
  const userId = session.user.id;
  const [canais, usuarios, eu, prefs] = await Promise.all([
    listarCanais(userId),
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
