import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { PushManager } from "@/components/notificacoes/push-manager";
import { FloatingChat } from "@/components/chat/floating-chat";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Perfis que participam do chat (cliente e freelancer ficam de fora — regra de negócio).
const CHAT_ROLES = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <Shell role={user.role} user={user}>
      <PushManager />
      <ConfirmProvider>{children}</ConfirmProvider>
      {/* Chat flutuante: dados carregados sob demanda (ao abrir) — não pesa a navegação. */}
      {CHAT_ROLES.includes(user.role) && <FloatingChat />}
    </Shell>
  );
}
