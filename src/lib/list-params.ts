/** Paginação/ordenação/filtro de listagens — partilhado entre query (server) e view (client). */

export const PAGE_SIZES = [12, 24, 48] as const;
export const PAGE_SIZE_PADRAO = 12;

export type Dir = "asc" | "desc";

export type ListParamsConfig = {
  /** Campos permitidos para ordenação (whitelist — evita injeção via URL). */
  sortFields: readonly string[];
  defaultSort?: string;
  defaultDir?: Dir;
  pageSizes?: readonly number[];
  defaultPageSize?: number;
};

export type ListParams = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: string | null;
  dir: Dir;
  q: string;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseListParams(sp: RawParams, cfg: ListParamsConfig): ListParams {
  const pageSizes = cfg.pageSizes ?? PAGE_SIZES;
  const defaultPageSize = cfg.defaultPageSize ?? PAGE_SIZE_PADRAO;

  const pageRaw = Number(first(sp.page));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const psRaw = Number(first(sp.pageSize));
  const pageSize = (pageSizes as readonly number[]).includes(psRaw) ? psRaw : defaultPageSize;

  const sortRaw = first(sp.sort);
  const sort = sortRaw && cfg.sortFields.includes(sortRaw) ? sortRaw : cfg.defaultSort ?? null;

  // Se o sort veio da URL, dir default é asc; se caímos no defaultSort sem dir, usa defaultDir.
  const dirRaw = first(sp.dir);
  const dir: Dir = dirRaw === "desc" ? "desc" : dirRaw === "asc" ? "asc" : cfg.defaultDir ?? "asc";

  const q = (first(sp.q) ?? "").trim();

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, sort, dir, q };
}

export function orderByPrisma(sort: string | null, dir: Dir): Record<string, Dir> | undefined {
  return sort ? { [sort]: dir } : undefined;
}

/** Total de páginas a partir do total de itens. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
