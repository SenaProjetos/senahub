"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BookMarked, BookOpen, HelpCircle, MessageSquare, Search } from "lucide-react";
import { ABRIR_CHAT } from "@/components/chat/floating-chat";
import { ChatBadge } from "@/components/chat/chat-badge";
import { UserMenu } from "@/components/shell/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationBell } from "@/components/notificacoes/notification-bell";
import { AgendaResumo } from "@/components/agenda/agenda-resumo";
import { JornadaHeader } from "@/components/ponto/jornada-header";
import { Breadcrumb } from "@/components/shell/breadcrumb";
import { useRotuloDaBarra } from "@/components/shell/rotulo-da-barra";
import { NAV_GROUPS, hrefAtivo, navItemsPara, type ContextoNav } from "@/lib/nav-config";
import type { Contratacao } from "@/generated/prisma/enums";

function titleFromPath(pathname: string): string {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  const href = hrefAtivo(pathname, items);
  return items.find((i) => i.href === href)?.title ?? "SenaHub";
}

export function Header({
  title,
  user,
  nav,
}: {
  title?: string;
  user: { name: string; email: string; contratacao: Contratacao | null; image?: string | null };
  nav: ContextoNav;
}) {
  const pathname = usePathname();
  const resolved = title ?? titleFromPath(pathname);
  const rotulo = useRotuloDaBarra(pathname);
  const globaisRef = useRef<HTMLDivElement>(null);
  const itensDoMenu = navItemsPara(nav).flatMap((g) => g.items);
  const temChat = itensDoMenu.some((i) => i.href === "/chat");
  const temAjuda = itensDoMenu.some((i) => i.href === "/ajuda");
  const temGuias = itensDoMenu.some((i) => i.href === "/guias");
  const atalhos = {
    minhaConta: itensDoMenu.some((i) => i.href === "/minha-ficha"),
    preferencias: itensDoMenu.some((i) => i.href === "/preferencias"),
    ajuda: temAjuda,
    guias: temGuias,
  };

  // Largura dos controles globais → `--barra-global`, que o `CabecalhoPagina` usa para não passar
  // por baixo deles quando sobe para esta linha. Muda com o relógio da jornada, o nome da conta e
  // o breakpoint, por isso observa em vez de medir uma vez. O valor do servidor fica em globals.css.
  useEffect(() => {
    const el = globaisRef.current;
    if (!el) return;
    const raiz = document.documentElement;
    const ro = new ResizeObserver(() => {
      raiz.style.setProperty("--barra-global", `${Math.ceil(el.getBoundingClientRect().width)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/85 px-4 backdrop-blur md:h-14 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav nav={nav} />
        {/* Título padrão: sai quando a página traz o próprio `CabecalhoPagina` (regra `:has()` em
            globals.css — sem JS, então já no HTML do servidor). */}
        <div className="min-w-0" data-titulo-padrao>
          {/* Registro aberto (projeto…): no celular o nome dele é o título da barra — o cabeçalho
              próprio da página não aparece nessa largura. */}
          {rotulo && (
            <div className="min-w-0 md:hidden">
              <p className="truncate text-xs text-muted-foreground">{rotulo.trilhaCelular}</p>
              <p className="truncate text-lg font-bold tracking-tight">{rotulo.tituloCelular}</p>
            </div>
          )}
          <div className={rotulo ? "hidden min-w-0 md:block" : "min-w-0"}>
            <Breadcrumb />
            <h1 className="truncate text-lg font-bold tracking-tight">{resolved}</h1>
          </div>
        </div>
      </div>
      <div ref={globaisRef} className="flex items-center gap-1.5">
        {/* Relógio da jornada antes da busca: dois relógios mono lado a lado (jornada +
            agenda) se confundem — a busca separa os dois visualmente. */}
        {/* Celular: relógio, data e tema saem da barra (o ponto está na barra de baixo e no Início;
            o tema, no menu da conta). `contents` mantém os filhos como itens do flex no desktop. */}
        <span className="hidden md:contents">
          <JornadaHeader />
        </span>
        <button
          type="button"
          data-tour="busca"
          onClick={() => window.dispatchEvent(new Event("open-command"))}
          aria-label="Buscar"
          title="Buscar (Ctrl K)"
          className="grid size-8 place-items-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" />
        </button>
        <span className="hidden md:contents">
          <AgendaResumo />
        </span>
        {/* Atalhos de uso diário que saíram do fundo do menu: no computador, chat e ajuda ficam à mão
            aqui (no celular o Chat está na barra de baixo). Só aparecem se o item existe para a pessoa. */}
        {/* O chat abre a janelinha de conversa daqui (sem botão flutuante); na própria tela de chat,
            o ícone só marca onde a pessoa está. */}
        {temChat &&
          (pathname.startsWith("/chat") ? (
            <Link
              href="/chat"
              aria-label="Chat"
              title="Chat"
              className="relative hidden size-8 place-items-center rounded-sm bg-muted text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid"
            >
              <MessageSquare className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(ABRIR_CHAT))}
              aria-label="Chat"
              title="Chat"
              className="relative hidden size-8 place-items-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:grid"
            >
              <MessageSquare className="size-4" />
              {/* Número como o do sino, na mesma posição; a cor (primária) separa chat de notificação. */}
              <ChatBadge className="absolute -right-0.5 -top-0.5 h-4 font-bold" />
            </button>
          ))}
        <span data-tour="notificacoes" className="flex">
          <NotificationBell />
        </span>
        {/* "?": Ajuda e Guias de uso saíram do menu lateral e moram aqui (modelo aprovado). */}
        {temAjuda && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Ajuda"
                  title="Ajuda e guias"
                  className="hidden size-8 place-items-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:grid"
                >
                  <HelpCircle className="size-4" />
                </button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href="/ajuda" />}>
                <BookOpen className="size-4" /> Ajuda e manual
              </DropdownMenuItem>
              {temGuias && (
                <DropdownMenuItem render={<Link href="/guias" />}>
                  <BookMarked className="size-4" /> Guias de uso
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span data-tour="conta" className="flex">
          <UserMenu user={user} atalhos={atalhos} />
        </span>
      </div>
    </header>
  );
}
