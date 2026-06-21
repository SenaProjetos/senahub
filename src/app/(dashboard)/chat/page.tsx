import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sincronizarCanaisDoUsuario } from "@/modules/chat/service";
import { listarCanais, usuariosParaDM } from "@/modules/chat/queries";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { ChatView } from "@/components/chat/chat-view";
import { CHAT_ROLES } from "@/modules/chat/roles";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  const user = await requireRole(...CHAT_ROLES);

  await sincronizarCanaisDoUsuario();
  const [canais, usuarios, eu, prefs] = await Promise.all([
    listarCanais(user.id, user.role),
    usuariosParaDM(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { chatStatus: true } }),
    getPreferencias(user.id),
  ]);

  return (
    <ChatView
      canais={canais}
      usuarios={usuarios}
      meId={user.id}
      meRole={user.role}
      status={eu?.chatStatus ?? "disponivel"}
      somChat={prefs.somChat !== false}
      mostrarRecibos={prefs.mostrarRecibos !== false}
    />
  );
}
