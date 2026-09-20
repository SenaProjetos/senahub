"use client";

import { useCallback, useMemo, useState } from "react";

import {
  alternar,
  alternarPagina,
  estadoDaPagina,
  foraDaPagina,
  selecaoAoAbrirMenu,
} from "@/lib/selecao";

/**
 * Seleção de linhas de uma lista — casca fina sobre `lib/selecao.ts`, que tem as regras.
 *
 * Chame **uma vez por tela** e passe o que cada linha precisa. A seleção atravessa filtro e
 * página (decisão do dono, 2026-09-20): o que foi marcado num filtro continua marcado quando o
 * filtro muda. Ela **não sobrevive a recarregar a página** — nada de `localStorage` aqui: seleção
 * esquecida de ontem é ação em lote surpresa hoje.
 *
 * `verSelecionados` é o botão "Selecionados (N)" da barra de filtros: é o único jeito de rever o
 * conjunto, já que parte dele está fora do filtro atual.
 */
export function useSelecao() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const [soSelecionados, setSoSelecionados] = useState(false);

  const lista = useMemo(() => [...ids], [ids]);

  const limpar = useCallback(() => {
    setIds(new Set());
    // Sem seleção, "ver selecionados" mostraria uma lista vazia sem explicação.
    setSoSelecionados(false);
  }, []);

  /** Substitui a seleção inteira — usado para tirar o que deixou de existir ou de ser visível. */
  const definir = useCallback((novos: Iterable<string>) => setIds(new Set(novos)), []);

  const alternarUm = useCallback((id: string) => setIds((atual) => alternar(atual, id)), []);

  const alternarDaPagina = useCallback(
    (idsDaPagina: readonly string[]) => setIds((atual) => alternarPagina(atual, idsDaPagina)),
    [],
  );

  /**
   * Chame ao ABRIR o menu de contexto numa linha: dentro da seleção, mantém o conjunto; fora
   * dela, a linha clicada vira a seleção inteira (regra 3 da ADR-0002). Devolve os ids sobre os
   * quais a ação vai valer — o `setIds` do React só chega no próximo render.
   */
  const aoAbrirMenu = useCallback(
    (id: string): string[] => {
      const proxima = selecaoAoAbrirMenu(ids, id);
      setIds(proxima);
      return [...proxima];
    },
    [ids],
  );

  const verSelecionados = useCallback((ver: boolean) => setSoSelecionados(ver), []);

  return {
    ids,
    lista,
    total: ids.size,
    marcado: useCallback((id: string) => ids.has(id), [ids]),
    alternar: alternarUm,
    alternarPagina: alternarDaPagina,
    aoAbrirMenu,
    definir,
    limpar,
    estadoDaPagina: useCallback((idsDaPagina: readonly string[]) => estadoDaPagina(ids, idsDaPagina), [ids]),
    foraDaPagina: useCallback((idsDaPagina: readonly string[]) => foraDaPagina(ids, idsDaPagina), [ids]),
    soSelecionados: soSelecionados && ids.size > 0,
    verSelecionados,
  };
}

export type Selecao = ReturnType<typeof useSelecao>;
