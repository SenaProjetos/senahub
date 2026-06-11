"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navItemsForRole } from "@/lib/nav-config";
import type { Role } from "@/lib/roles";

const COLLAPSED_KEY = "senahub:sidebar-collapsed";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  }

  const groups = navItemsForRole(role);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo: completa expandida, símbolo quando colapsada */}
      <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5")}>
        <Link href="/" className="flex items-center overflow-hidden">
          {collapsed ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/MARCA/logo_dark.svg" alt="SenaHub" className="hidden h-8 w-auto dark:block" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/MARCA/logo_light.svg" alt="SenaHub" className="h-8 w-auto dark:hidden" />
            </>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/MARCA/logo_completa_dark.svg" alt="SenaHub" className="hidden h-9 w-auto dark:block" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/MARCA/logo_completa_light.svg" alt="SenaHub" className="h-9 w-auto dark:hidden" />
            </>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groups.map((group, gi) => (
          <div key={group.title ?? gi}>
            {group.title && !collapsed && (
              <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {group.title}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const link = (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
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
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-sidebar-border p-2", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn("text-muted-foreground", !collapsed && "w-full justify-start gap-2")}
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" />
              <span className="text-xs">Minimizar</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
