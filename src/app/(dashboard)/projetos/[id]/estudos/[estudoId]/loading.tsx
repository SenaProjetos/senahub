import { Skeleton } from "@/components/ui/skeleton";

/** Estado de carregamento do estudo: cabeçalho, ambientes com cargas e o painel de resultado. */
export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Carregando estudo">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-4 w-64" />
      {[2, 1].map((cargas, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: cargas }).map((_, j) => (
            <div key={j} className="space-y-2 rounded-md border p-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      ))}
      <Skeleton className="h-40 w-full rounded-lg" />
      <span className="sr-only">Carregando estudo…</span>
    </div>
  );
}
