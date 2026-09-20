"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Selecao } from "@/components/ui/use-selecao";

type Resultado<T> = { ok: true; data: T[] } | { ok: false; error: string };

/**
 * A visão "Selecionados (N)" de uma lista **paginada no servidor**.
 *
 * Nessas listas a linha marcada pode estar em outra página ou fora do filtro atual, então o
 * cliente não a tem. Com o botão ligado, busca as linhas por id (`carregar`) e ignora os demais
 * filtros — é o que permite rever um conjunto montado em filtros diferentes. Listas carregadas
 * inteiras no cliente não precisam disto: filtram `itens` pelos marcados.
 *
 * O servidor decide o que devolve (escopo e permissão são dele, o id só estreita). Marcado que
 * sumiu — excluído, ou fora do acesso agora — não volta, e `indisponiveis` conta quantos são.
 */
export function useVisaoSelecionados<T>(selecao: Selecao, carregar: (ids: string[]) => Promise<Resultado<T>>) {
  // A chave identifica a seleção que a resposta guardada representa: resposta de uma seleção
  // anterior nunca aparece como se fosse a atual.
  const chave = [...selecao.lista].sort().join(",");
  const [carregado, setCarregado] = useState<{ chave: string; linhas: T[] } | null>(null);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    if (!selecao.soSelecionados) return;
    let vivo = true;
    void carregarRef.current(selecao.lista).then((r) => {
      if (!vivo) return;
      if (r.ok) setCarregado({ chave, linhas: r.data });
      else toast.error(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [selecao.soSelecionados, selecao.lista, chave]);

  const ativo = selecao.soSelecionados;
  const carregando = ativo && carregado?.chave !== chave;
  const linhas = ativo && !carregando ? (carregado?.linhas ?? []) : null;

  return {
    /** As linhas marcadas, já do servidor; `null` enquanto a visão está desligada ou carregando. */
    linhas,
    carregando,
    /** Marcados que o servidor não devolveu mais. */
    indisponiveis: linhas ? Math.max(0, selecao.total - linhas.length) : 0,
  };
}
