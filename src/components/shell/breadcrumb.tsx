"use client";

import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav-config";
import { getFerramenta } from "@/modules/ferramentas/registry";

/** Mapa href -> título, montado a partir do NAV_GROUPS (1º segmento). */
const HREF_TO_TITLE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      // Apenas hrefs de primeiro nível (ex.: "/projetos"), ignorando subrotas.
      const segments = item.href.split("/").filter(Boolean);
      if (segments.length === 1) {
        map["/" + segments[0]] = item.title;
      }
    }
  }
  return map;
})();

function capitalize(segment: string): string {
  const text = decodeURIComponent(segment).replace(/[-_]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Segmentos que parecem id (numérico, uuid, cuid) viram "Detalhe". */
function looksLikeId(segment: string): boolean {
  return (
    /^\d+$/.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment) ||
    /^c[a-z0-9]{20,}$/i.test(segment)
  );
}

type Crumb = { href: string; label: string };

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/", label: "Início" }];

  let acc = "";
  segments.forEach((segment, index) => {
    acc += "/" + segment;
    let label: string;
    if (index === 0 && HREF_TO_TITLE[acc]) {
      label = HREF_TO_TITLE[acc];
    } else if (index === 1 && segments[0] === "ferramentas") {
      // Slug da ferramenta → nome amigável do registry (nunca expor a chave crua).
      label = getFerramenta(segment)?.nome ?? capitalize(segment);
    } else if (looksLikeId(segment)) {
      label = "Detalhe";
    } else {
      label = capitalize(segment);
    }
    crumbs.push({ href: acc, label });
  });

  return crumbs;
}

export function Breadcrumb() {
  const pathname = usePathname();

  // Raiz: sem breadcrumb.
  if (pathname === "/") return null;

  const crumbs = buildCrumbs(pathname);

  return (
    <nav aria-label="Trilha de navegação" className="min-w-0">
      <ol className="flex items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              {index > 0 && (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
              <li className="min-w-0">
                {isLast ? (
                  <span className="truncate font-medium text-foreground" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
