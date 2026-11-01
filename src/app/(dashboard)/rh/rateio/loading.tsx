import { Skeleton } from "@/components/ui/skeleton";

/** O cálculo de cada mês leva um tempo (refaz o custo de todo mundo): a lista mostra a forma antes. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="space-y-2 rounded-sm border p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
