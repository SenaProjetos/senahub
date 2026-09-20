"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lembra o nome de cada linha já exibida, por id.
 *
 * A seleção atravessa páginas e filtros (ADR-0002, onda 2), então um lote pode incluir linhas que
 * não estão mais na página. O relatório de falhas do lote precisa dizer QUAL item falhou; sem
 * isto só sobra o id, que não diz nada a quem lê. Quem nunca foi visto cai no próprio id.
 */
export function useNomesVistos<T>(linhas: readonly T[], id: (l: T) => string, nome: (l: T) => string) {
  const mapa = useRef(new Map<string, string>());

  useEffect(() => {
    for (const l of linhas) mapa.current.set(id(l), nome(l));
  }, [linhas, id, nome]);

  return useCallback((chave: string) => mapa.current.get(chave) ?? chave, []);
}
