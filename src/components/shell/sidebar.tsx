"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { APP_VERSION, VERSION_LABEL } from "@/lib/version";
import type { ContextoNav } from "@/lib/nav-config";

const COLLAPSED_KEY = "senahub:sidebar-collapsed";

export function Sidebar({ nav }: { nav: ContextoNav }) {
  const [collapsed, setCollapsed] = useState(false);
  // Cliente (tipo "externo") não vê o histórico técnico de versões — é linguagem de commit.
  const interno = nav.tipo === "interno";

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  }

  return (
    <aside
      data-tour="nav"
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Logo: completa expandida, símbolo quando colapsada */}
      <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5")}>
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

      <SidebarNav nav={nav} collapsed={collapsed} />

      {collapsed ? (
        <div className="flex justify-center border-t border-sidebar-border p-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={toggle} aria-label="Expandir menu">
            <ChevronsRight className="size-4" />
          </Button>
          <span className="sr-only" title={VERSION_LABEL}>
            {APP_VERSION}
          </span>
        </div>
      ) : (
        // Aberto, como no modelo aprovado: uma linha só, "« Minimizar · v1.21.0". O rótulo completo
        // (com o commit, para o suporte) fica no `title` e no topo de /versoes.
        <div className="flex items-center justify-center gap-0.5 border-t border-sidebar-border p-2 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={toggle}
            aria-label="Minimizar menu"
            className="rounded-sm px-0.5 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            « Minimizar
          </button>
          <span aria-hidden>·</span>
          {interno ? (
            // Interno: a versão abre o histórico de mudanças.
            <Link
              href="/versoes"
              title={`${VERSION_LABEL} — ver histórico de versões`}
              className="rounded-sm px-0.5 transition-colors outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              v{APP_VERSION}
            </Link>
          ) : (
            <span className="px-0.5 select-all" title={VERSION_LABEL}>
              v{APP_VERSION}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}
