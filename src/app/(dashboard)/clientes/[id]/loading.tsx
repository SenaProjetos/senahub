import { Skeleton } from "@/components/ui/skeleton";

/** Carregamento da ficha do cliente: título, dados e financeiro, contatos e projetos. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando cliente">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 lg:col-span-2" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
      <span className="sr-only">Carregando cliente…</span>
    </div>
  );
}
