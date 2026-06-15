import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PushManager } from "@/components/notificacoes/push-manager";
import { listarCanais, usuariosParaDM } from "@/modules/chat/queries";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { FloatingChat } from "@/components/chat/floating-chat";

// Perfis que participam do chat (cliente e freelancer ficam de fora — regra de negócio).
const CHAT_ROLES = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  let floating = null;
  if (CHAT_ROLES.includes(user.role)) {
    const [canais, usuarios, eu, prefs] = await Promise.all([
      listarCanais(user.id),
      usuariosParaDM(user.id),
      prisma.user.findUnique({ where: { id: user.id }, select: { chatStatus: true } }),
      getPreferencias(user.id),
    ]);
    floating = (
      <FloatingChat
        canais={canais}
        usuarios={usuarios}
        meId={user.id}
        status={eu?.chatStatus ?? "disponivel"}
        somChat={prefs.somChat !== false}
        mostrarRecibos={prefs.mostrarRecibos !== false}
      />
    );
  }

  return (
    <Shell role={user.role} user={user}>
      <PushManager />
      {children}
      {floating}
    </Shell>
  );
}
