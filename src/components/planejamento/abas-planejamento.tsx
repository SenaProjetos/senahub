import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * As duas abas do Planejamento (pool de recursos, decisão K): o Planejamento geral (todos os cronogramas, só para ver) e
 * os Projetos individuais (os cards de sempre). Vai logo DEPOIS do `CabecalhoPagina`, que tem de ser o primeiro elemento
 * da página. Quem não vê o Planejamento geral (decisão 7) não vê as abas.
 */
export function AbasPlanejamento({ atual }: { atual: "geral" | "projetos" }) {
  const aba = (id: "geral" | "projetos", href: string, rotulo: string) => (
    <Link
      href={href}
      aria-current={atual === id ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center px-3 text-sm focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        atual === id ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted",
      )}
    >
      {rotulo}
    </Link>
  );
  return (
    <nav aria-label="Visões do Planejamento" className="inline-flex overflow-hidden rounded-sm border">
      {aba("geral", "/planejamento/cronograma", "Planejamento geral")}
      {aba("projetos", "/planejamento", "Projetos individuais")}
    </nav>
  );
}
