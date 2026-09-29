/**
 * Itens por página lembrados POR LISTA (reunião de 29/09/2026: "botei 48 e ele sempre volta para 12").
 * PURO e client-safe: quem lê é o servidor (`porPaginaDaLista`, no lugar do `defaultPageSize` de
 * `parseListParams`) e quem grava é o `Pagination`, uma chave por lista em `UserPreference`.
 *
 * Uma chave por lista, e não um objeto com todas: `salvarPreferencia` grava o valor inteiro da chave, então duas
 * listas mexendo no mesmo objeto se atropelariam. A URL (`?pageSize=`) continua mandando — o link que alguém
 * mandou com 12 abre com 12.
 */
import { PAGE_SIZES, PAGE_SIZE_PADRAO } from "./list-params";

export const chavePorPagina = (lista: string) => `por_pagina:${lista}`;

/**
 * O tamanho que a pessoa escolheu para esta lista, ou `padrao`. Valor que não é um dos tamanhos oferecidos
 * (preferência velha, lixo) cai no padrão — nunca vira `take` de uma consulta.
 */
export function porPaginaPreferido(prefs: Record<string, unknown>, lista: string, padrao: number = PAGE_SIZE_PADRAO): number {
  const valor = prefs[chavePorPagina(lista)];
  return typeof valor === "number" && (PAGE_SIZES as readonly number[]).includes(valor) ? valor : padrao;
}
