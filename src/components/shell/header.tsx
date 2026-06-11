"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell } from "@/components/notificacoes/notification-bell";
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
      <h1 className="truncate text-lg font-bold tracking-tight">{resolved}</h1>
      <div className="flex items-center gap-1.5">
        <Clock />
        <NotificationBell />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
