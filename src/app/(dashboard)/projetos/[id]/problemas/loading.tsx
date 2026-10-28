import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado de carregamento da aba Problemas. Espelha a tela real (barra de filtros + seções por
 * disciplina com linhas) para não haver salto quando o conteúdo entra.
 */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" role="status" aria-label="Carregando problemas">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-48" />
      </div>

      <div className="space-y-3">
        {[3, 2, 2].map((linhas, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-8" />
            </div>
            {Array.from({ length: linhas }).map((_, j) => (
              <div key={j} className="space-y-1.5 py-1">
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando problemas…</span>
    </div>
  );
}
