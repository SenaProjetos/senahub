import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { PushManager } from "@/components/notificacoes/push-manager";
import { FloatingChat } from "@/components/chat/floating-chat";
import { ChatPresenceProvider } from "@/components/chat/chat-presence-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { GOOGLE_FONTS_HREF } from "@/modules/documentos/fontes-tipograficas";
import { CHAT_ROLES } from "@/modules/chat/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Gate do Termo de Uso: bloqueia o sistema até o aceite da versão vigente.
  // requireUser já tratou a troca de senha pendente; o termo vem na sequência.
  // A tela /termo vive no grupo (auth), fora deste layout — sem loop de redirect.
  if (await precisaAceitarTermo(user)) redirect("/termo");

  const participaDoChat = (CHAT_ROLES as readonly string[]).includes(user.role);

  const conteudo = (
    <Shell role={user.role} user={user}>
      {/* Google Fonts do catálogo de documentos: carregam no editor e no preview/PDF
          (o Puppeteer imprime a própria página de preview, que vive neste layout). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <PushManager />
      <ConfirmProvider>{children}</ConfirmProvider>
      {/* Chat flutuante: dados carregados sob demanda (ao abrir) — não pesa a navegação. */}
      {participaDoChat && <FloatingChat />}
    </Shell>
  );

  // Provider global do chat (socket único + badge de não lidas) só para perfis de chat.
  return participaDoChat ? <ChatPresenceProvider>{conteudo}</ChatPresenceProvider> : conteudo;
}
