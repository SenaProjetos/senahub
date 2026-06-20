"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSetParams } from "@/lib/use-set-param";
import { PAGE_SIZES } from "@/lib/list-params";

/** Controle de paginação por searchParams (page/pageSize). */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
}: {
  page: number;
  pageCount: number;
  pageSize?: number;
  total?: number;
}) {
  const setParams = useSetParams();
  if (pageCount <= 1 && pageSize == null) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 text-xs text-muted-foreground">
      {total != null && <span className="mr-auto">{total} item(ns)</span>}
      {pageSize != null && (
        <Select value={String(pageSize)} onValueChange={(v) => setParams({ pageSize: v, page: null })}>
          <SelectTrigger className="h-7 w-[4.5rem]">
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
