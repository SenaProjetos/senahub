"use client";

import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav-config";
import { getFerramenta } from "@/modules/ferramentas/registry";
import { useRotuloDaBarra, type RotuloBarra } from "@/components/shell/rotulo-da-barra";

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

/**
 * Rotas cujo SEGMENTO não descreve mais o que a página é. `capitalize()` deriva do caminho, e
 * caminho é contrato (link salvo, histórico de auditoria) — quando o conteúdo muda e a rota fica,
 * a trilha passa a mentir. Manter curto: cada linha aqui é uma divergência entre URL e conteúdo.
 */
const ROTULO_POR_ROTA: Record<string, string> = {
  "/configuracoes/permissoes": "Piso de sócio",
  // Segmento sem acento (URL): a trilha escreveria "Cenarios".
  "/financeiro/cenarios": "Cenários salvos",
  "/financeiro/distribuicao": "Regras de distribuição",
  "/financeiro/relatorio-dimensao": "Relatório por dimensão",
  // A aba é "Minhas horas"; a URL curta escreveria só "Horas".
  "/ponto/horas": "Minhas horas",
  // Fora do menu (mora no sino), então HREF_TO_TITLE não a conhece.
  "/notificacoes": "Notificações",
};

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

export type BreadcrumbItem = { href?: string; label: string };

function buildCrumbs(pathname: string, rotulo: RotuloBarra | null): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ href: "/", label: "Início" }];

  let acc = "";
  segments.forEach((segment, index) => {
    acc += "/" + segment;
    let label: string;
    if (ROTULO_POR_ROTA[acc]) {
      label = ROTULO_POR_ROTA[acc];
    } else if (index === 0 && HREF_TO_TITLE[acc]) {
      label = HREF_TO_TITLE[acc];
    } else if (index === 1 && segments[0] === "ferramentas") {
      // Slug da ferramenta → nome amigável do registry (nunca expor a chave crua).
      label = getFerramenta(segment)?.nome ?? capitalize(segment);
    } else if (looksLikeId(segment)) {
      label = rotulo?.segmento === segment ? rotulo.nome : "Detalhe";
    } else {
      label = capitalize(segment);
    }
    crumbs.push({ href: acc, label });
  });

  return crumbs;
}

export function Breadcrumb({
  items,
  ariaLabel = "Trilha de navegação",
}: {
  /**
   * Trilhas com nomes já resolvidos pelo servidor, como projeto/disciplina/documento.
   * Sem este valor, preserva a montagem automática a partir da URL usada pelo shell.
   */
  items?: BreadcrumbItem[];
  ariaLabel?: string;
} = {}) {
  const pathname = usePathname();
  const rotulo = useRotuloDaBarra(pathname);

  // Raiz: sem breadcrumb.
  if ((!items && pathname === "/") || items?.length === 0) return null;

  const crumbs = items ?? buildCrumbs(pathname, rotulo);

  return (
    <nav aria-label={ariaLabel} className="min-w-0">
      <ol className="flex items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href ?? `${crumb.label}-${index}`}>
              {index > 0 && (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
              {/* O item atual (repetido no título) encolhe primeiro; os outros têm um piso, para
                  "Início" não virar "I…". */}
              <li className={isLast ? "min-w-0 shrink-[4]" : "min-w-8"}>
                {isLast || !crumb.href ? (
                  // `block`: truncate em elemento em linha não corta — o texto vazava por cima do vizinho
                  // (e do botão ao lado) quando a trilha não cabia, no celular.
                  <span className="block truncate font-medium text-foreground" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="block truncate transition-colors hover:text-foreground"
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
