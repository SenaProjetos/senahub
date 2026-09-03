import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sincronizarCanaisDoUsuario } from "@/modules/chat/service";
import { emitParaUsuario } from "@/lib/socket";
import { listarCanais, usuariosParaDM } from "@/modules/chat/queries";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  // Gate por permissão desde 2026-09-02 (F2 de
  // docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md). Era
  // `requireRole(...CHAT_ROLES)` — o par `chat:usar` existia no catálogo e governava só o item
  // de menu, então conceder chat a um papel novo mostrava o link e dava 403 aqui.
  // Sem mudança de acesso: a semente de `chat:usar` é exatamente `CHAT_ROLES`.
  const user = await requirePermission("chat", "usar");

  // Quem perdeu `chat:geral` (ou deixou de ser sócio) sai do canal aqui. Emitir `sair-canal`
  // fecha a aba na hora em quem estiver com o chat aberto — sem isto, a pessoa segue vendo a
  // lista de mensagens antiga até recarregar, e a revogação parece não ter funcionado.
  const { removidos } = await sincronizarCanaisDoUsuario();
  for (const m of removidos) emitParaUsuario(m.userId, "sair-canal", { canalId: m.canalId });
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
