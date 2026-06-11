"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_GROUPS } from "@/lib/nav-config";

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

export function Header({ title }: { title?: string }) {
  const pathname = usePathname();
  const resolved = title ?? titleFromPath(pathname);
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
      <h1 className="truncate text-lg font-bold tracking-tight">{resolved}</h1>
      <div className="flex items-center gap-1.5">
        <Clock />
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
          <Bell className="size-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
