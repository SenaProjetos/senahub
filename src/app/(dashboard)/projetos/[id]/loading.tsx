import { Skeleton } from "@/components/ui/skeleton";

export default function ProjetoLoading() {
  return (
    <div className="space-y-4" aria-label="Carregando projeto" aria-busy="true">
      <div className="space-y-2 border-b pb-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-36" />)}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <div className="grid gap-3 2xl:grid-cols-[3fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
