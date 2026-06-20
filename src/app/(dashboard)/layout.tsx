import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { PushManager } from "@/components/notificacoes/push-manager";
import { FloatingChat } from "@/components/chat/floating-chat";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { GOOGLE_FONTS_HREF } from "@/modules/documentos/fontes-tipograficas";

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
      {/* Google Fonts do catálogo de documentos: carregam no editor e no preview/PDF
          (o Puppeteer imprime a própria página de preview, que vive neste layout). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <PushManager />
      <ConfirmProvider>{children}</ConfirmProvider>
      {/* Chat flutuante: dados carregados sob demanda (ao abrir) — não pesa a navegação. */}
      {CHAT_ROLES.includes(user.role) && <FloatingChat />}
    </Shell>
  );
}
