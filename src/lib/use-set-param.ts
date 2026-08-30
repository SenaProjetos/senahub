"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Atualiza os searchParams da URL preservando os demais. Mudar qualquer chave
 * que não seja `page` reinicia a paginação (remove `page`). Use um único objeto
 * para alterar várias chaves de uma vez (ex.: sort + dir) sem condição de corrida.
 *
 * `replace: true` troca a entrada do histórico em vez de empilhar uma nova. É para campo com
 * debounce (busca que dispara enquanto se digita): sem isso, cada pausa vira uma entrada e o
 * botão Voltar desfaz a busca letra por letra em vez de sair da tela.
 */
export function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null>, opts?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      let mudouFiltro = false;
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
        if (key !== "page") mudouFiltro = true;
      }
      if (mudouFiltro) params.delete("page");
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}
