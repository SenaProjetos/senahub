import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando a prancha…
      </span>
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[60svh] w-full" />
    </div>
  );
}
