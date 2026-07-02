"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SecaoNav = {
  chave: string;
  titulo: string;
  paginas: { slug: string; titulo: string }[];
};

/** Navegação lateral do manual: seções e suas páginas, com destaque da ativa. */
export function ManualNav({ secoes }: { secoes: SecaoNav[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-4 text-sm">
      <Link
        href="/ajuda"
        className={cn(
          "block rounded-sm px-2 py-1 font-medium transition-colors",
          pathname === "/ajuda" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Início do manual
      </Link>
      {secoes.map((s) => (
        <div key={s.chave}>
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {s.titulo}
          </p>
          <ul className="space-y-0.5">
            {s.paginas.map((p) => {
              const href = `/ajuda/${p.slug}`;
              const active = pathname === href;
              return (
                <li key={p.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "block truncate rounded-sm px-2 py-1 transition-colors",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    {p.titulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
