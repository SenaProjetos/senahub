"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import type { Role } from "@/lib/roles";

const COLLAPSED_KEY = "senahub:sidebar-collapsed";

export function Sidebar({ role }: { role: Role }) {
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

      <SidebarNav role={role} collapsed={collapsed} mounted={mounted} />

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
