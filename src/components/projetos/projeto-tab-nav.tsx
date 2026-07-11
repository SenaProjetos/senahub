"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Visão Geral", suffix: "" },
  { label: "Inputs", suffix: "/inputs" },
  { label: "Financeiro", suffix: "/financeiro" },
  { label: "Lista Mestre", suffix: "/lista-mestre" },
  { label: "Serviços", suffix: "/servicos" },
  { label: "Arquivos", suffix: "/arquivos" },
  { label: "Compatibilização", suffix: "/coordenacao" },
  { label: "Diário", suffix: "/diario" },
  { label: "Extras", suffix: "/extras" },
  { label: "Histórico", suffix: "/historico" },
] as const;

export function ProjetoTabNav({
  projetoId,
  abasVisiveis = TABS.map((t) => t.suffix),
}: {
  projetoId: string;
  abasVisiveis?: readonly string[];
}) {
  const pathname = usePathname();
  const base = `/projetos/${projetoId}`;

  return (
    <nav
      className="flex gap-0 overflow-x-auto border-b scrollbar-none"
      aria-label="Seções do projeto"
    >
      {TABS.filter((t) => abasVisiveis.includes(t.suffix)).map(({ label, suffix }) => {
        const href = `${base}${suffix}`;
        const isActive = suffix === "" ? pathname === base : pathname === href;
        return (
          <Link
            key={suffix}
            href={href}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
