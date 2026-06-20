"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import type { Role } from "@/lib/roles";

/**
 * Sidebar como drawer no mobile (< lg): botão hamburger no header abre um
 * painel deslizante à esquerda com a MESMA navegação da sidebar (reutiliza
 * SidebarNav). Fecha ao navegar, no backdrop, no Esc. No lg+ fica oculto —
 * a sidebar fixa assume.
 */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menu"
            className="text-muted-foreground lg:hidden"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 max-w-[80vw] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link href="/" className="flex items-center overflow-hidden" onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MARCA/logo_completa_dark.svg" alt="SenaHub" className="hidden h-9 w-auto dark:block" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MARCA/logo_completa_light.svg" alt="SenaHub" className="h-9 w-auto dark:hidden" />
          </Link>
        </div>
        <SidebarNav role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
