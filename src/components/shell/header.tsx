"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationBell } from "@/components/notificacoes/notification-bell";
import { Breadcrumb } from "@/components/shell/breadcrumb";
import { NAV_GROUPS } from "@/lib/nav-config";
import type { Role } from "@/lib/roles";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!now) return <span className="font-mono text-xs text-muted-foreground">--:--</span>;

  return (
    <span className="font-mono text-xs tabular-nums text-muted-foreground">
      {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}{" "}
      {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

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
}: {
  title?: string;
  user: { name: string; email: string; role: Role; image?: string | null };
}) {
  const pathname = usePathname();
  const resolved = title ?? titleFromPath(pathname);
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav role={user.role} />
        <div className="min-w-0">
          <Breadcrumb />
          <h1 className="truncate text-lg font-bold tracking-tight">{resolved}</h1>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-command"))}
          aria-label="Buscar"
          className="flex h-8 items-center gap-2 rounded-sm border border-border px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:border-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Buscar</span>
          <kbd className="hidden font-mono text-[10px] text-muted-foreground sm:inline">Ctrl K</kbd>
        </button>
        <Clock />
        <NotificationBell />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
