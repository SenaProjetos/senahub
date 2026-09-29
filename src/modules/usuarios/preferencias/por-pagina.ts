import "server-only";
import { getSession } from "@/lib/session";
import { PAGE_SIZE_PADRAO } from "@/lib/list-params";
import { porPaginaPreferido } from "@/lib/por-pagina";
import { getPreferencias } from "./queries";

/**
 * Itens por página desta lista para a pessoa logada — vai no `defaultPageSize` de `parseListParams`, então a
 * URL continua mandando (ver `lib/por-pagina.ts`). A sessão e as preferências são lidas uma vez por
 * requisição (`getSession` e `getPreferencias` usam `cache`), e o layout já as tinha lido.
 *
 * Nunca falha: fora de uma requisição (script, teste), sem sessão ou com o banco fora, devolve o padrão — a
 * lista abre como sempre abriu em vez de cair por causa de uma preferência de conforto.
 */
export async function porPaginaDaLista(lista: string, padrao: number = PAGE_SIZE_PADRAO): Promise<number> {
  try {
    const sessao = await getSession();
    if (!sessao) return padrao;
    return porPaginaPreferido(await getPreferencias(sessao.user.id), lista, padrao);
  } catch {
    return padrao;
  }
}
