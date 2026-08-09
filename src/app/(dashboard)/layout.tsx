import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { permissoesEfetivas } from "@/lib/permissao-efetiva";
import { prisma } from "@/lib/prisma";
import type { ContextoNav } from "@/lib/nav-config";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { PushManager } from "@/components/notificacoes/push-manager";
import { AvisoProvider } from "@/components/notificacoes/aviso-provider";
import { AcessoTracker } from "@/components/uso/acesso-tracker";
import { FloatingChat } from "@/components/chat/floating-chat";
import { ChatPresenceProvider } from "@/components/chat/chat-presence-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { DisciplinasIconeProvider } from "@/components/projetos/disciplina-icone";
import { mapaIconesDisciplina } from "@/modules/projetos/queries";
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
  const [iconesDisciplina, prefs] = await Promise.all([
    mapaIconesDisciplina(),
    getPreferencias(user.id),
  ]);
  // Chaves `tour_visto:*` já concluídas — evita reabrir guias que o usuário já viu.
  const toursVistos = Object.entries(prefs)
    .filter(([k, v]) => k.startsWith("tour_visto:") && v === true)
    .map(([k]) => k);

  // Contexto do menu, calculado UMA vez por request e descido como prop: `nav-config` é
  // importado por componentes client, então o filtro precisa ser puro — e checar item a item
  // seriam 41 consultas por render (Onda D, §15.16).
  const eixos = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tipo: true, setor: true, superUsuario: true, perfilId: true },
  });
  const nav: ContextoNav = {
    permitidas: await permissoesEfetivas({
      id: user.id,
      ativo: user.ativo,
      superUsuario: eixos?.superUsuario ?? false,
      perfilId: eixos?.perfilId ?? null,
    }),
    tipo: eixos?.tipo ?? null,
    setor: eixos?.setor ?? null,
  };

  const conteudo = (
    <ConfirmProvider>
     <OnboardingProvider vistosIniciais={toursVistos}>
     <DisciplinasIconeProvider mapa={iconesDisciplina}>
      <Shell nav={nav} user={user}>
        {/* Google Fonts do catálogo de documentos: carregam no editor e no preview/PDF
            (o Puppeteer imprime a própria página de preview, que vive neste layout). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <PushManager />
        <AvisoProvider />
        <AcessoTracker />
        {children}
        {/* Chat flutuante: dados carregados sob demanda (ao abrir) — não pesa a navegação. */}
        {participaDoChat && <FloatingChat />}
      </Shell>
     </DisciplinasIconeProvider>
     </OnboardingProvider>
    </ConfirmProvider>
  );

  // Provider global do chat (socket único + badge de não lidas) só para perfis de chat.
  return participaDoChat ? <ChatPresenceProvider>{conteudo}</ChatPresenceProvider> : conteudo;
}
