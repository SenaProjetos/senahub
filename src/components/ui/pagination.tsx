"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSetParams } from "@/lib/use-set-param";
import { PAGE_SIZES } from "@/lib/list-params";
import { chavePorPagina } from "@/lib/por-pagina";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";

/**
 * Controle de paginação por searchParams (page/pageSize).
 *
 * Com `lista`, o tamanho escolhido também vira preferência da pessoa PARA AQUELA LISTA: a página, ao abrir
 * sem `?pageSize=`, o lê de volta (`porPaginaDaLista`, no `defaultPageSize` de `parseListParams`). O nome é o
 * mesmo nos dois lados — `lib/por-pagina.ts`.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  lista,
}: {
  page: number;
  pageCount: number;
  pageSize?: number;
  total?: number;
  /** Nome estável da lista ("projetos", "tarefas"…); sem ele, a escolha vale só para esta URL. */
  lista?: string;
}) {
  const setParams = useSetParams();
  if (pageCount <= 1 && pageSize == null) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 text-xs text-muted-foreground">
      {total != null && <span className="mr-auto">{total} item(ns)</span>}
      {pageSize != null && (
        // base-ui: onValueChange pode entregar null — ignora para não zerar o param.
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            if (!v) return;
            setParams({ pageSize: v, page: null });
            // Conforto, não dado: se não gravar, a lista continua funcionando com o que está na URL.
            if (lista) void salvarPreferencia({ chave: chavePorPagina(lista), valor: Number(v) });
          }}
        >
          <SelectTrigger className="h-7 w-fit min-w-[5.5rem] gap-1 px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}/pág
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => setParams({ page: String(page - 1) })}
      >
        Anterior
      </Button>
      <span>
        {page} / {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => setParams({ page: String(page + 1) })}
      >
        Próxima
      </Button>
    </div>
  );
}
