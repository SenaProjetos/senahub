"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HelpCircle, MessageSquare, Search } from "lucide-react";
import { ChatBadge } from "@/components/chat/chat-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationBell } from "@/components/notificacoes/notification-bell";
import { AgendaResumo } from "@/components/agenda/agenda-resumo";
import { JornadaHeader } from "@/components/ponto/jornada-header";
import { Breadcrumb } from "@/components/shell/breadcrumb";
import { NAV_GROUPS, navItemsPara, type ContextoNav } from "@/lib/nav-config";
import type { Role } from "@/lib/roles";

function titleFromPath(pathname: string): string {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  const match = items.find((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href),
  );
  return match?.title ?? "SenaHub";
}

export function Header({
  title,
  user,
  nav,
}: {
  title?: string;
  user: { name: string; email: string; role: Role; image?: string | null };
  nav: ContextoNav;
}) {
  const pathname = usePathname();
  const resolved = title ?? titleFromPath(pathname);
  const globaisRef = useRef<HTMLDivElement>(null);
  const itensDoMenu = navItemsPara(nav).flatMap((g) => g.items);
  const temChat = itensDoMenu.some((i) => i.href === "/chat");
  const temAjuda = itensDoMenu.some((i) => i.href === "/ajuda");

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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav nav={nav} />
        {/* Título padrão: sai quando a página traz o próprio `CabecalhoPagina` (regra `:has()` em
            globals.css — sem JS, então já no HTML do servidor). */}
        <div className="min-w-0" data-titulo-padrao>
          <Breadcrumb />
          <h1 className="truncate text-lg font-bold tracking-tight">{resolved}</h1>
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
          className="flex h-8 items-center gap-2 rounded-sm border border-border px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:border-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Buscar</span>
          <kbd className="hidden font-mono text-[10px] text-muted-foreground sm:inline">Ctrl K</kbd>
        </button>
        {/* Atalhos de uso diário que saíram do fundo do menu: no computador, chat e ajuda ficam à mão
            aqui (no celular o Chat está na barra de baixo). Só aparecem se o item existe para a pessoa. */}
        {temChat && (
          <Link
            href="/chat"
            aria-label="Chat"
            title="Chat"
            className="relative hidden size-8 place-items-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:grid"
          >
            <MessageSquare className="size-4" />
            <ChatBadge dot className="absolute right-0.5 top-0.5" />
          </Link>
        )}
        {temAjuda && (
          <Link
            href="/ajuda"
            aria-label="Ajuda"
            title="Ajuda e manual"
            className="hidden size-8 place-items-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:grid"
          >
            <HelpCircle className="size-4" />
          </Link>
        )}
        <span className="hidden md:contents">
          <AgendaResumo />
        </span>
        <span data-tour="notificacoes" className="flex">
          <NotificationBell />
        </span>
        <span className="hidden md:contents">
          <ThemeToggle />
        </span>
        <span data-tour="conta" className="flex">
          <UserMenu user={user} />
        </span>
      </div>
    </header>
  );
}
