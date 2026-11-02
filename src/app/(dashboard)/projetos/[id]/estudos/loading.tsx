import { Skeleton } from "@/components/ui/skeleton";

/** Estado de carregamento da aba Estudos: o título e a lista de estudos. */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando estudos">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5 rounded-lg border bg-card p-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-72" />
            <Skeleton className="h-3 w-60" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando estudos…</span>
    </div>
  );
}
