"use client";

import { Clock } from "lucide-react";
import type { RecenteCalculo, FormatoExport } from "@/modules/ferramentas/types";

type Props = {
  recentes: (Omit<RecenteCalculo, "createdAt"> & { createdAt: string })[];
  onAbrir: (id: string) => void;
  /** Formatos de export disponíveis para esta ferramenta. */
  exportaveis: FormatoExport[];
};

const FORMATO_LABEL: Record<FormatoExport, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  dxf: "DXF",
};

export function RecentesList({ recentes, onAbrir, exportaveis }: Props) {
  if (recentes.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Nenhum cálculo salvo ainda.</p>;
  }

  return (
    <ul className="space-y-1">
      {recentes.map((r) => (
        <li key={r.id} className="rounded-md hover:bg-accent transition-colors">
          <button
            onClick={() => onAbrir(r.id)}
            className="w-full text-left flex items-center gap-2 px-2 pt-1.5 text-sm group"
          >
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{r.titulo}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          </button>
          {exportaveis.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2 pb-1.5 pl-7">
              {exportaveis.map((fmt) => (
                <a
                  key={fmt}
                  href={`/api/ferramentas/calculos/${r.id}/${fmt}`}
                  download
                  className="text-[11px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                >
                  {FORMATO_LABEL[fmt]}
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
