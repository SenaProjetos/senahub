import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { tipoEfetivo } from "@/lib/roles";
import { permissoesEfetivas } from "@/lib/permissao-efetiva";
import { prisma } from "@/lib/prisma";
import type { ContextoNav } from "@/lib/nav-config";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { precisaAssinarHolerite } from "@/modules/rh/folha/queries";
import { contarCertidoesAtencao } from "@/modules/certidoes/queries";
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

  // Gate da assinatura do holerite: mesma mecânica do termo, e nesta ordem de propósito — termo
  // primeiro (vale pra todo mundo), holerite depois (só quem tem folha fechada pendente).
  // A tela /assinar-holerite também vive no grupo (auth), fora deste layout.
  if (await precisaAssinarHolerite(user)) redirect("/assinar-holerite");

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
    // `tipoEfetivo` e não `eixos.tipo` cru: a coluna é nullable, e `null` quer dizer "sem vínculo
    // aplicado", não "externo". Sem a rede, um colaborador sem vínculo perde os 14 itens de menu
    // que usam este eixo — em silêncio. É o MESMO helper de `requireInterno()`, de propósito:
    // menu e gate divergirem produz "vê o link e toma 404".
    tipo: tipoEfetivo(eixos?.tipo, user.role),
    setor: eixos?.setor ?? null,
  };

  // Bolinha numerada de Certidões. Derivada de `nav.permitidas` (já pago acima) e não de um
  // `can()`, pelo mesmo motivo do `participaDoChat` abaixo: este layout embrulha toda rota do
  // dashboard, e uma consulta a mais por navegação para quem nem vê o item é desperdício.
  // São dois `count` sobre o índice de `validade` — ver `contarCertidoesAtencao`.
  if (nav.permitidas.includes("certidoes:ver")) {
    const { vencidas, venceEmBreve } = await contarCertidoesAtencao();
    const total = vencidas + venceEmBreve;
    if (total > 0) {
      nav.alertas = {
        "/certidoes": {
          total,
          // Vermelho só para o que JÁ venceu; "vence em breve" sozinho é âmbar.
          critico: vencidas > 0,
          descricao: [
            vencidas > 0 ? `${vencidas} vencida${vencidas > 1 ? "s" : ""}` : null,
            venceEmBreve > 0 ? `${venceEmBreve} vence${venceEmBreve > 1 ? "m" : ""} em breve` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      };
    }
  }

  // Mesmo eixo do gate de `/chat` e das rotas de API — ver o comentário em `chat/page.tsx`.
  // Derivado de `nav.permitidas` e NÃO de um `can()` próprio: este layout embrulha toda rota do
  // dashboard, e `can()` faz uma consulta não-cacheada por chamada (override não é cacheado, de
  // propósito). `permissoesEfetivas` já pagou essa leitura uma vez acima — um `can()` aqui seria
  // um round-trip extra em CADA navegação, para responder o que já está na mão.
  const participaDoChat = nav.permitidas.includes("chat:usar");

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
