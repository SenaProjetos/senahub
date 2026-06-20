"use client";

import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { TableHead } from "@/components/ui/table";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

/** Cabeçalho de tabela clicável que ordena por `field` via searchParams (sort/dir). */
export function SortableHead({
  field,
  children,
  className,
}: {
  field: string;
  children: React.ReactNode;
  className?: string;
}) {
  const sp = useSearchParams();
  const setParams = useSetParams();
  const active = sp.get("sort") === field;
  const dir = sp.get("dir") === "desc" ? "desc" : "asc";

  function toggle() {
    if (!active) setParams({ sort: field, dir: "asc" });
    else setParams({ sort: field, dir: dir === "asc" ? "desc" : "asc" });
  }

  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
        aria-label={`Ordenar por ${field}`}
      >
        {children}
        <Icon className={cn("size-3.5", !active && "text-muted-foreground/50")} aria-hidden />
      </button>
    </TableHead>
  );
}
