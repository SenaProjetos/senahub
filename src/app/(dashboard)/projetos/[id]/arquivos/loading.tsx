import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado de carregamento da aba Arquivos (F1-PR10).
 *
 * A tela virou server-rendered com consulta paginada; sem isto, trocar de página, de
 * disciplina ou de filtro deixava a rota em branco até a resposta chegar. O desenho
 * espelha o layout real (painel de disciplinas + barra de filtros + tabela) para não
 * haver salto quando o conteúdo entra.
 */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando documentos">
      <Skeleton className="h-3 w-64" />
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="space-y-2 rounded-md border border-border bg-card p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Carregando documentos…</span>
    </div>
  );
}
