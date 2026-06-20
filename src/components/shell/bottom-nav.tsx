"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItemsForRole } from "@/lib/nav-config";
import type { Role } from "@/lib/roles";

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsForRole(role)
    .flatMap((g) => g.items)
    .filter((i) => i.mobile)
    .slice(0, 6);

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden">
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
