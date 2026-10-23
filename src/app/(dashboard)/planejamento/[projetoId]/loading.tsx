import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto do planejamento do projeto: cabeçalho, faixa de status, barra de ferramentas e o quadro do cronograma. */
export default function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-80 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-7 w-96 max-w-full" />
        <Skeleton className="h-7 w-28" />
      </div>
      <Skeleton className="h-[60vh] w-full" />
    </div>
  );
}
