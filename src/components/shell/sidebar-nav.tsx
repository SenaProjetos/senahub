"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navItemsPara, type AlertaNav, type ContextoNav, type NavGroup, type NavItem } from "@/lib/nav-config";
import { ChatBadge } from "@/components/chat/chat-badge";
import { NavBadge } from "@/components/shell/nav-badge";


const GROUP_KEY = (title: string) => `navGroups:${title}`;

function isItemActive(item: NavItem, pathname: string) {
  return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
}

function NavList({
  items,
  pathname,
  collapsed,
  mounted,
  alertas,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  mounted: boolean;
  alertas?: Record<string, AlertaNav>;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isItemActive(item, pathname);
        // Chat tem badge próprio (socket, tempo real); o resto vem do servidor por request.
        const isChat = item.href === "/chat";
        const alerta = isChat ? undefined : alertas?.[item.href];
        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center px-0",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <span className="relative shrink-0">
              <item.icon className="size-[18px]" />
              {isChat && collapsed && <ChatBadge dot className="absolute -right-1 -top-1" />}
              {alerta && collapsed && <NavBadge alerta={alerta} dot className="absolute -right-1 -top-1" />}
            </span>
            {!collapsed && <span className="truncate">{item.title}</span>}
            {isChat && !collapsed && <ChatBadge className="ml-auto" />}
            {alerta && !collapsed && <NavBadge alerta={alerta} className="ml-auto" />}
          </Link>
        );
        return (
          <li key={item.href}>
            {collapsed && mounted ? (
              <Tooltip>
                <TooltipTrigger render={link} />
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CollapsibleGroup({
  group,
  pathname,
  mounted,
  alertas,
  onNavigate,
}: {
  group: NavGroup & { title: string };
  pathname: string;
  mounted: boolean;
  alertas?: Record<string, AlertaNav>;
  onNavigate?: () => void;
}) {
  // Aberto por padrão; restaura preferência do localStorage após montar.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(GROUP_KEY(group.title));
    if (stored !== null) setOpen(stored === "1");
  }, [group.title]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(GROUP_KEY(group.title), next ? "1" : "0");
      return next;
    });
  }

  // Mantém o grupo visível (e ignora o estado fechado) se houver item ativo dentro,
  // para nunca esconder a página atual.
  const hasActive = group.items.some((item) => isItemActive(item, pathname));
  const expanded = open || hasActive;

  // Grupo fechado esconde os itens — e esconderia o badge junto. Some os alertas de dentro e
  // mostra o total no cabeçalho enquanto está fechado, senão "3 certidões vencidas" fica
  // invisível para quem deixou "Gestão" recolhido (que é o padrão de quem não usa o grupo).
  const alertaDoGrupo = somarAlertas(group.items, alertas);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left transition-colors outline-none hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {group.title}
        </span>
        <span className="flex items-center gap-1.5">
          {!expanded && alertaDoGrupo && <NavBadge alerta={alertaDoGrupo} />}
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="mt-1">
          <NavList
            items={group.items}
            pathname={pathname}
            collapsed={false}
            mounted={mounted}
            alertas={alertas}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

/** Alerta agregado de um grupo — soma as contagens, crítico se qualquer item estiver crítico. */
function somarAlertas(items: NavItem[], alertas?: Record<string, AlertaNav>): AlertaNav | null {
  if (!alertas) return null;
  const dos = items.map((i) => alertas[i.href]).filter((a): a is AlertaNav => !!a && a.total > 0);
  if (dos.length === 0) return null;
  return {
    total: dos.reduce((s, a) => s + a.total, 0),
    critico: dos.some((a) => a.critico),
    descricao: dos.map((a) => a.descricao).join(" · "),
  };
}

/**
 * Conteúdo de navegação compartilhado entre a sidebar fixa (desktop) e o
 * drawer mobile. `collapsed` só é usado no modo icon-only do desktop; o drawer
 * sempre passa `collapsed={false}` e um `onNavigate` para fechar ao navegar.
 */
export function SidebarNav({
  nav,
  collapsed = false,
  mounted = true,
  onNavigate,
}: {
  nav: ContextoNav;
  collapsed?: boolean;
  mounted?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = navItemsPara(nav);

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
      {groups.map((group, gi) => {
        // Sem título, sidebar colapsada (icon-only) OU grupo de item único: estático, sem seta de expandir.
        if (!group.title || collapsed || group.items.length === 1) {
          return (
            <div key={group.title ?? gi}>
              {group.title && !collapsed && (
                <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {group.title}
                </p>
              )}
              <NavList
                items={group.items}
                pathname={pathname}
                collapsed={collapsed}
                mounted={mounted}
                alertas={nav.alertas}
                onNavigate={onNavigate}
              />
            </div>
          );
        }
        return (
          <CollapsibleGroup
            key={group.title}
            group={group as NavGroup & { title: string }}
            pathname={pathname}
            mounted={mounted}
            alertas={nav.alertas}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}
