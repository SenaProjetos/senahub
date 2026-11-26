import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * As duas abas de Recursos (pool de recursos, decisão K): a Visão geral de sempre (capacidade × carga, mapa de calor,
 * sugestões) e a tela Por pessoa. Vai logo DEPOIS do `CabecalhoPagina` (que tem de ser o primeiro elemento da página).
 */
export function AbasRecursos({ atual }: { atual: "geral" | "pessoa" }) {
  const aba = (id: "geral" | "pessoa", href: string, rotulo: string) => (
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
    <nav aria-label="Visões de Recursos" className="inline-flex overflow-hidden rounded-sm border">
      {aba("geral", "/recursos", "Visão geral")}
      {aba("pessoa", "/recursos/por-pessoa", "Por pessoa")}
    </nav>
  );
}
