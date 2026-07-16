"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/ponto", label: "Bater ponto", icon: Clock },
  { href: "/ponto/espelho", label: "Espelho", icon: CalendarClock },
] as const;

/** Sub-abas do módulo Ponto: bater ponto ⇄ espelho (o espelho saiu do menu e vive aqui). */
export function PontoSubnav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b">
      {ABAS.map((a) => {
        const ativo = pathname === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              ativo
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <a.icon className="size-4" /> {a.label}
          </Link>
        );
      })}
    </div>
  );
}
