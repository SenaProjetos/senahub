"use client";

import { Clock } from "lucide-react";
import type { RecenteCalculo } from "@/modules/ferramentas/types";

type Props = {
  recentes: (Omit<RecenteCalculo, "createdAt"> & { createdAt: string })[];
  onAbrir: (id: string) => void;
};

export function RecentesList({ recentes, onAbrir }: Props) {
  if (recentes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Nenhum cálculo salvo ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {recentes.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onAbrir(r.id)}
            className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors group"
          >
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{r.titulo}</span>
            <span className="text-xs text-muted-foreground shrink-0 group-hover:opacity-100 opacity-60">
              {new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
