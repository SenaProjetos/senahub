import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sincronizarCanaisDoUsuario } from "@/modules/chat/service";
import { listarCanais, usuariosParaDM } from "@/modules/chat/queries";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  // Freelancer e cliente não entram no chat (regra de negócio).
  const user = await requireRole(
    "admin",
    "supervisor",
    "administrativo",
    "clt",
    "estagiario",
    "projetista_pj",
  );

  await sincronizarCanaisDoUsuario();
  const [canais, usuarios, eu] = await Promise.all([
    listarCanais(user.id),
    usuariosParaDM(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { chatStatus: true } }),
  ]);

  return (
    <ChatView
      canais={canais}
      usuarios={usuarios}
      meId={user.id}
      status={eu?.chatStatus ?? "disponivel"}
    />
  );
}
