import { Skeleton } from "@/components/ui/skeleton";

/** "Mensagens de clientes" carregando: cabeçalho, o filtro e as linhas da lista. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando as mensagens de clientes…
      </span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="divide-y rounded-lg border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5 px-3 py-2.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
