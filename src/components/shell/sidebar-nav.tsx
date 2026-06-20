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
import { navItemsForRole, type NavGroup, type NavItem } from "@/lib/nav-config";
import type { Role } from "@/lib/roles";

const GROUP_KEY = (title: string) => `navGroups:${title}`;

function isItemActive(item: NavItem, pathname: string) {
  return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
}

function NavList({
  items,
  pathname,
  collapsed,
  mounted,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  mounted: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isItemActive(item, pathname);
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
            <item.icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.title}</span>}
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
  onNavigate,
}: {
  group: NavGroup & { title: string };
  pathname: string;
  mounted: boolean;
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

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left transition-colors outline-none hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {group.title}
        </span>
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="mt-1">
          <NavList
            items={group.items}
            pathname={pathname}
            collapsed={false}
            mounted={mounted}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Conteúdo de navegação compartilhado entre a sidebar fixa (desktop) e o
 * drawer mobile. `collapsed` só é usado no modo icon-only do desktop; o drawer
 * sempre passa `collapsed={false}` e um `onNavigate` para fechar ao navegar.
 */
export function SidebarNav({
  role,
  collapsed = false,
  mounted = true,
  onNavigate,
}: {
  role: Role;
  collapsed?: boolean;
  mounted?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = navItemsForRole(role);

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
      {groups.map((group, gi) => {
        // Sem título OU sidebar colapsada (icon-only): sempre visível, não colapsável.
        if (!group.title || collapsed) {
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
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}
